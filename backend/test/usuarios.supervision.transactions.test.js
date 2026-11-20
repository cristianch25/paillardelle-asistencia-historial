import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { testUser, updatePool } from '../test-support/usuarios-update-pool.js';

function fixture() {
  const state = updatePool([testUser('1'), testUser('2', 'SUBDIRECCION', { nivel_asignado: 'PRIMARIA' })]);
  const repository = createSupervisionRepository(() => state.pool);
  const supervision = createSupervisionService({ repository });
  const users = createUsuariosService({ repository: createUsuariosRepository(() => state.pool), supervision });
  state.additional.set('2', ['SECUNDARIA']);
  return { state, repository, supervision, users };
}

test('permisos: conexiones, SQL parametrizado, bloqueo común y auditoría en una sola transacción', async () => {
  const { state, supervision } = fixture();
  await supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1');
  const events = state.transactions[0];
  const calls = events.filter(item => item.sql);
  assert.match(calls[0].sql, /WHERE rol = \? AND activo = \? ORDER BY id FOR UPDATE$/);
  assert.deepEqual(calls[1].params, ['1']);
  assert.deepEqual(calls[2].params, ['2']);
  assert.match(calls[3].sql, /usuario_niveles_adicionales.*FOR UPDATE$/);
  assert.deepEqual(calls.find(item => item.sql.startsWith('INSERT INTO usuario_niveles')).params, ['2', 'INICIAL']);
  assert.equal(calls.some(item => /password_hash|SELECT \*/.test(item.sql)), false);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
  assert.equal(state.transactions.length, 1);
});

test('fallo de borrado/inserción/auditoría revierte permisos y libera; no hay estado parcial', async () => {
  for (const failAt of ['levels-delete', 'levels-insert', 'audit']) {
    const { state, supervision } = fixture(); state.failAt = failAt;
    await assert.rejects(supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1'));
    assert.deepEqual(state.additional.get('2'), ['SECUNDARIA']);
    assert.equal(state.audits.length, 0);
    assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
});

test('fallo al auditar retirada por rol revierte tanto usuario como adicionales', async () => {
  const { state, users } = fixture(); state.failAt = 'audit';
  await assert.rejects(users.update('2', { rol: 'REGISTRADOR' }, '1'));
  assert.equal(state.users.get('2').rol, 'SUBDIRECCION');
  assert.deepEqual(state.additional.get('2'), ['SECUNDARIA']);
  assert.equal(state.audits.length, 0);
});

test('COMMIT fallido siempre descarta: el resultado puede haber persistido, sin reintentos', async () => {
  for (const failAt of ['commit', 'commit-after']) {
    const { state, supervision } = fixture(); state.failAt = failAt;
    await assert.rejects(supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1'));
    assert.equal(state.transactions.length, 1);
    assert.deepEqual(state.transactions[0].slice(-3), ['commit', 'rollback', 'destroy']);
    assert.equal(state.transactions[0].includes('release'), false);
    assert.deepEqual(state.additional.get('2'), [failAt === 'commit' ? 'SECUNDARIA' : 'INICIAL']);
  }
});

test('rollback y destroy fallidos conservan el error de auditoría; release fallido descarta tras confirmar', async () => {
  const first = fixture();
  Object.assign(first.state, { failAt: 'audit', rollbackFails: true, destroyFails: true });
  await assert.rejects(first.supervision.update('2', { niveles_adicionales: [] }, '1'), /Auditoría privada/);
  assert.deepEqual(first.state.transactions[0].slice(-2), ['rollback', 'destroy']);
  const second = fixture(); second.state.releaseFails = true;
  await assert.rejects(second.supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1'), /release privado/);
  assert.deepEqual(second.state.additional.get('2'), ['INICIAL']);
  assert.deepEqual(second.state.transactions[0].slice(-3), ['commit', 'release', 'destroy']);
});

test('concesión concurrente con abandono de rol nunca deja permisos latentes', async () => {
  for (const grantFirst of [true, false]) {
    const { state, supervision, users } = fixture();
    const grant = () => supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1');
    const change = () => users.update('2', { rol: 'REGISTRADOR' }, '1');
    const results = await Promise.allSettled(grantFirst ? [grant(), change()] : [change(), grant()]);
    assert.equal(results[grantFirst ? 1 : 0].status, 'fulfilled');
    assert.equal(state.users.get('2').rol, 'REGISTRADOR');
    assert.equal(state.additional.has('2'), false);
    if (!grantFirst) assert.equal(results[1].reason.status, 409);
  }
});

test('revocación concurrente prevalece tras concesión y cambio de nivel no permite duplicar el principal', async () => {
  const { state, supervision, users } = fixture();
  await Promise.all([supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1'),
    supervision.update('2', { niveles_adicionales: [] }, '1')]);
  assert.deepEqual((await supervision.get('2')).niveles_efectivos, ['PRIMARIA']);
  await Promise.all([supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1'),
    users.update('2', { nivel_asignado: 'INICIAL' }, '1')]);
  assert.equal(state.additional.has('2'), false);
  assert.deepEqual((await supervision.get('2')).niveles_efectivos, ['INICIAL']);
});

test('deadlock y timeout responden 409, sin reintentar ni alterar niveles', async () => {
  for (const failAt of ['deadlock', 'timeout']) {
    const { state, supervision } = fixture(); state.failAt = failAt;
    await assert.rejects(supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1'), { status: 409 });
    assert.deepEqual(state.additional.get('2'), ['SECUNDARIA']);
    assert.equal(state.transactions.length, 1);
  }
});

test('ADMIN desactivado por SUPERUSUARIO mientras espera no puede conceder permisos', async () => {
  const { state, supervision, users } = fixture();
  state.users.set('7', testUser('7', 'SUPERUSUARIO'));
  state.users.set('8', testUser('8'));
  const results = await Promise.allSettled([
    users.update('1', { activo: false }, '7', true),
    supervision.update('2', { niveles_adicionales: ['INICIAL'] }, '1'),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.status, 401);
  assert.deepEqual(state.additional.get('2'), ['SECUNDARIA']);
  assert.equal(state.audits.length, 1);
});
