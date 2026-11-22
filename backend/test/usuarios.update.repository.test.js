import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { updatePool, testUser } from '../test-support/usuarios-update-pool.js';

function fixture(initial) {
  const state = updatePool(initial);
  const repository = createUsuariosRepository(() => state.pool);
  return { ...state, service: createUsuariosService({ repository }), state };
}

test('PATCH usa una conexión, bloqueo previo al UPDATE y auditoría anterior/nueva sin secretos', async () => {
  const { service, state } = fixture();
  const updated = await service.update('3', { nombres: 'Nuevo', cargo: 'Auxiliar' }, '1');
  assert.equal(updated.nombres, 'Nuevo');
  assert.equal(updated.cargo, 'Auxiliar');
  assert.equal(state.users.get('3').puede_escanear_qr, 0);
  assert.equal(state.users.get('3').puede_usar_bitacora, 0);
  assert.equal(Object.hasOwn(updated, 'puede_escanear_qr'), false);
  assert.equal(Object.hasOwn(updated, 'puede_usar_bitacora'), false);
  assert.equal(Object.hasOwn(updated, 'password_hash'), false);
  assert.equal(state.transactions.length, 1);
  const events = state.transactions[0];
  assert.equal(events[0], 'begin');
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
  const statements = events.filter(event => event.sql);
  assert.equal(statements[0].sql, 'SELECT id FROM usuarios WHERE rol = ? AND activo = ? ORDER BY id FOR UPDATE');
  assert.deepEqual(statements[0].params, ['ADMIN', 1]);
  const update = statements.find(item => item.sql.startsWith('UPDATE'));
  assert.equal(update.sql, 'UPDATE usuarios SET nombres = ?, cargo = ? WHERE id = ?');
  assert.deepEqual(update.params, ['Nuevo', 'Auxiliar', '3']);
  const [actorId, action, entity, id, before, after] = state.audits[0];
  assert.deepEqual([actorId, action, entity, id], ['1', 'ACTUALIZAR_USUARIO', 'usuarios', '3']);
  assert.equal(JSON.parse(before).nombres, 'Nombre ficticio');
  assert.equal(JSON.parse(after).nombres, 'Nuevo');
  assert.equal(/password|HASH_FICTICIO/.test(before + after), false);
  assert.doesNotMatch(before + after, /puede_escanear_qr|puede_usar_bitacora/);
  assert.equal(statements.some(item => /puede_escanear_qr|puede_usar_bitacora/.test(item.sql)), false);
  assert.equal(statements.some(item => /UPDATE (asignaciones|configuracion_sistema)|DELETE/.test(item.sql)), false);
});

test('un PATCH sin cambios no ejecuta UPDATE ni auditoría', async () => {
  const { service, state } = fixture();
  await service.update('3', { nombres: 'Nombre ficticio' }, '1');
  await service.update('3', { activo: true }, '1', true);
  assert.equal(state.audits.length, 0);
  assert.equal(state.transactions.flat().some(item => item.sql?.startsWith('UPDATE')), false);
});

test('fallos de UPDATE o auditoría revierten filas y liberan la conexión', async () => {
  for (const failAt of ['update', 'audit']) {
    const { service, state } = fixture();
    const original = structuredClone(state.users.get('3'));
    state.failAt = failAt;
    await assert.rejects(service.update('3', { nombres: 'No debe persistir' }, '1'));
    assert.deepEqual(state.users.get('3'), original);
    assert.equal(state.audits.length, 0);
    assert.equal(state.transactions[0].includes('commit'), false);
    assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
});

test('si también falla ROLLBACK, la conexión se descarta y no vuelve al pool', async () => {
  const { service, state } = fixture();
  state.failAt = 'audit-and-rollback';
  await assert.rejects(service.update('3', { nombres: 'Otro' }, '1'));
  assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'destroy']);
  assert.equal(state.transactions[0].includes('release'), false);
  assert.equal(state.transactions[0].includes('commit'), false);
});

test('asignaciones históricas se conservan; actuales y futuras se bloquean y validan', async () => {
  const { service, state } = fixture();
  state.assignments.push({ usuario_id: '3', nivel: 'PRIMARIA', fecha_fin: '2200-01-01' });
  const original = structuredClone(state.assignments);
  await assert.rejects(service.update('3', { rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }, '1'), { status: 409 });
  await assert.rejects(service.update('3', { nivel_asignado: 'SECUNDARIA' }, '1'), { status: 409 });
  assert.deepEqual(state.assignments, original);
  const statement = state.transactions[0].find(item => item.sql?.includes('FROM asignaciones'));
  assert.match(statement.sql, /WHERE a.usuario_id = \? ORDER BY a.id FOR UPDATE$/);
  assert.deepEqual(statement.params, ['3']);
  state.assignments[0].fecha_fin = '2000-01-01';
  assert.equal((await service.update('3', { rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }, '1')).rol, 'SUBDIRECCION');
});

test('SUPERUSUARIO desactiva concurrentemente y conserva el último ADMIN activo', async () => {
  const { service, state } = fixture([testUser('1'), testUser('2'), testUser('9', 'SUPERUSUARIO')]);
  const results = await Promise.allSettled([
    service.update('2', { activo: false }, '9', true),
    service.update('1', { activo: false }, '9', true),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal([...state.users.values()].filter(user => user.rol === 'ADMIN' && user.activo).length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.transactions[1].includes('rollback'), true);
});

test('ADMIN no reduce otros ADMIN; UNIQUE y bloqueos devuelven 409', async () => {
  const { service, state } = fixture([testUser('1'), testUser('2'), testUser('9', 'SUPERUSUARIO')]);
  const results = await Promise.allSettled([
    service.update('2', { rol: 'REGISTRADOR' }, '1'),
    service.update('1', { rol: 'REGISTRADOR' }, '2'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 0);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 403);
  assert.equal([...state.users.values()].filter(user => user.rol === 'ADMIN' && user.activo).length, 2);
  for (const failAt of ['duplicate', 'deadlock', 'timeout']) {
    const scenario = fixture();
    scenario.state.failAt = failAt;
    await assert.rejects(scenario.service.update('3', { usuario: 'otro' }, '1'), { status: 409 });
    assert.equal(scenario.state.transactions[0].includes('commit'), false);
  }
});
