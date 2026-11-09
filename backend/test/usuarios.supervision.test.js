import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { testUser, updatePool } from '../test-support/usuarios-update-pool.js';

function fixture() {
  const state = updatePool([testUser('1'), testUser('2', 'SUBDIRECCION', { nivel_asignado: 'PRIMARIA' }),
    testUser('3', 'REGISTRADOR', { nivel_asignado: 'INICIAL' }),
    testUser('4', 'SUBDIRECCION', { nivel_asignado: 'SECUNDARIA' }),
    testUser('5', 'SUBDIRECCION', { nivel_asignado: 'SECUNDARIA' })]);
  const service = createSupervisionService({ repository: createSupervisionRepository(() => state.pool) });
  const users = createUsuariosService({ repository: createUsuariosRepository(() => state.pool), supervision: service });
  return { state, service, users };
}

test('supervisión efectiva es principal + adicionales explícitos, sin excepción PRIMARIA/INICIAL', async () => {
  const { state, service } = fixture();
  const user = state.users.get('2');
  assert.deepEqual(await service.levelsFor(user), ['PRIMARIA']);
  const granted = await service.update('2', { niveles_adicionales: ['INICIAL'] }, '1');
  assert.deepEqual(granted, { usuario_id: '2', nivel_principal: 'PRIMARIA',
    niveles_adicionales: ['INICIAL'], niveles_efectivos: ['PRIMARIA', 'INICIAL'] });
  assert.deepEqual(await service.levelsFor(user), ['PRIMARIA', 'INICIAL']);
  await service.update('2', { niveles_adicionales: [] }, '1');
  assert.deepEqual(await service.levelsFor(user), ['PRIMARIA']);
  assert.equal(state.audits.length, 2);
  const audit = state.audits[0];
  assert.deepEqual(audit.slice(0, 4), ['1', 'ACTUALIZAR_NIVELES_ADICIONALES', 'usuario_niveles_adicionales', '2']);
  assert.deepEqual(JSON.parse(audit[4]).niveles_adicionales, []);
  assert.deepEqual(JSON.parse(audit[5]).niveles_adicionales, ['INICIAL']);
  assert.equal(/password|HASH/.test(audit[4] + audit[5]), false);
});

test('dos subdirectores de SECUNDARIA tienen igual ámbito, sin asignaciones; REGISTRADOR ignora adicionales', async () => {
  const { state, service } = fixture();
  for (const id of ['4', '5']) assert.deepEqual(await service.levelsFor(state.users.get(id)), ['SECUNDARIA']);
  state.additional.set('3', ['PRIMARIA', 'SECUNDARIA']);
  assert.deepEqual(await service.levelsFor(state.users.get('3')), []);
  await assert.rejects(service.update('3', { niveles_adicionales: ['PRIMARIA'] }, '1'), { status: 409 });
});

test('entradas estrictas, principal duplicado, destino inexistente y rol del actor revalidado', async () => {
  const { state, service } = fixture();
  for (const body of [null, [], {}, { niveles_adicionales: 'INICIAL' }, { niveles_adicionales: [1] },
    { niveles_adicionales: ['inicial'] }, { niveles_adicionales: ['INICIAL', 'INICIAL'] },
    { niveles_adicionales: ['INICIAL'], rol: 'SUBDIRECCION' }]) {
    const before = state.transactions.length;
    await assert.rejects(service.update('2', body, '1'), { status: 400 });
    assert.equal(state.transactions.length, before);
  }
  await assert.rejects(service.update('2', { niveles_adicionales: ['PRIMARIA'] }, '1'), { status: 409 });
  await assert.rejects(service.get('999'), { status: 404 });
  await assert.rejects(service.update('999', { niveles_adicionales: [] }, '1'), { status: 404 });
  state.users.get('1').rol = 'REGISTRADOR';
  await assert.rejects(service.update('2', { niveles_adicionales: ['INICIAL'] }, '1'), { status: 403 });
  state.users.get('1').activo = 0;
  await assert.rejects(service.update('2', { niveles_adicionales: [] }, '1'), { status: 401 });
});

test('PUT sin cambios no escribe ni audita; desactivación impide acceso y reactivación respeta configuración', async () => {
  const { state, service, users } = fixture();
  await service.update('2', { niveles_adicionales: ['INICIAL'] }, '1');
  const auditCount = state.audits.length;
  await service.update('2', { niveles_adicionales: ['INICIAL'] }, '1');
  assert.equal(state.audits.length, auditCount);
  await users.update('2', { activo: false }, '1', true);
  assert.deepEqual(await service.levelsFor(state.users.get('2')), []);
  assert.deepEqual((await service.get('2')).niveles_adicionales, ['INICIAL']);
  await users.update('2', { activo: true }, '1', true);
  assert.deepEqual(await service.levelsFor(state.users.get('2')), ['PRIMARIA', 'INICIAL']);
});

test('abandonar SUBDIRECCION retira adicionales con auditoría atómica y no reaparecen al volver', async () => {
  const { state, service, users } = fixture();
  await service.update('2', { niveles_adicionales: ['INICIAL', 'SECUNDARIA'] }, '1');
  const count = state.audits.length;
  await users.update('2', { rol: 'REGISTRADOR' }, '1');
  assert.deepEqual(state.additional.get('2'), undefined);
  assert.equal(state.audits.length, count + 2);
  await users.update('2', { rol: 'SUBDIRECCION' }, '1');
  assert.deepEqual(await service.levelsFor(state.users.get('2')), ['PRIMARIA']);
});

test('cambiar principal elimina solo el adicional redundante; restricciones de asignaciones siguen vigentes', async () => {
  const { state, service, users } = fixture();
  await service.update('2', { niveles_adicionales: ['INICIAL', 'SECUNDARIA'] }, '1');
  await users.update('2', { nivel_asignado: 'INICIAL' }, '1');
  assert.deepEqual((await service.get('2')).niveles_adicionales, ['SECUNDARIA']);
  state.assignments.push({ usuario_id: '3', nivel: 'INICIAL', fecha_fin: '2200-01-01' });
  await assert.rejects(users.update('3', { rol: 'SUBDIRECCION' }, '1'), { status: 409 });
  await assert.rejects(users.update('3', { nivel_asignado: 'PRIMARIA' }, '1'), { status: 409 });
});
