import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignmentFixture, assignmentBody } from '../test-support/asignaciones-pool.js';

test('asignaciones concurrentes iniciales: dos ADMIN, un alta y un 409 sin duplicar auditoría', async () => {
  const { service, state, admin } = assignmentFixture();
  const results = await Promise.allSettled([service.create(assignmentBody, admin), service.create(assignmentBody, state.users.get('2'))]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.status, 409);
  assert.equal(state.assignments.length, 1); assert.equal(state.audits.length, 1);
});

test('asignaciones y edición real de usuarios coordinan cambio de rol/nivel en ambos órdenes', async () => {
  for (const patch of [{ rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }, { nivel_asignado: 'SECUNDARIA' }]) {
    for (const assignFirst of [true, false]) {
      const { service, state, admin, users } = assignmentFixture();
      const assign = () => service.create(assignmentBody, admin);
      const edit = () => users.update('3', patch, '2');
      const results = await Promise.allSettled(assignFirst ? [assign(), edit()] : [edit(), assign()]);
      assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
      assert.equal(results[1].reason.status, 409);
      assert.equal(state.assignments.length, assignFirst ? 1 : 0);
      assert.equal(state.audits.length, 1);
    }
  }
});

test('asignaciones: revocación del actor o desactivación del destinatario antes del bloqueo impide alta', async () => {
  for (const [id, patch, status] of [['1', { activo: false }, 401],
    ['3', { activo: false }, 409]]) {
    const { service, state, admin, users } = assignmentFixture();
    state.users.set('7', { id: '7', rol: 'SUPERUSUARIO', activo: 1 });
    const results = await Promise.allSettled([users.update(id, patch, id === '1' ? '7' : '2', Object.hasOwn(patch, 'activo')),
      service.create(assignmentBody, admin)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.status, status);
    assert.equal(state.assignments.length, 0);
  }
});

test('asignaciones: revalida año después de esperar, sin insertar en año cerrado', async () => {
  const { service, state, admin } = assignmentFixture();
  state.beforeYear = async () => { state.year.estado = 'CERRADO'; };
  await assert.rejects(service.create(assignmentBody, admin), { status: 409 });
  assert.equal(state.assignments.length, 0);
});

test('asignaciones: fallos de adquisición, BEGIN, consultas, INSERT, ID y auditoría no dejan alta parcial', async () => {
  for (const failAt of ['acquire', 'begin', 'user', 'year', 'insert', 'id', 'result', 'audit']) {
    const { state, service, admin } = assignmentFixture(); state.failAt = failAt;
    await assert.rejects(service.create(assignmentBody, admin));
    assert.equal(state.assignments.length, 0); assert.equal(state.audits.length, 0);
  }
});

test('asignaciones: rollback fallido conserva el error principal y descarta', async () => {
  const { service, state, admin } = assignmentFixture();
  Object.assign(state, { failAt: 'audit', rollbackFails: true, destroyFails: true });
  await assert.rejects(service.create(assignmentBody, admin), /Auditoría privada ficticia/);
  assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'destroy']);
});

test('asignaciones: COMMIT incierto descarta siempre; no reintenta y release no revierte confirmación', async () => {
  for (const options of [{ failAt: 'commit' }, { failAt: 'commit-after' }, { releaseFails: true }]) {
    const { service, state, admin } = assignmentFixture(); Object.assign(state, options);
    await assert.rejects(service.create(assignmentBody, admin));
    assert.equal(state.transactions.length, 1); assert.equal(state.transactions[0].at(-1), 'destroy');
    assert.equal(state.assignments.length, options.failAt === 'commit' ? 0 : 1);
    assert.equal(state.audits.length, options.failAt === 'commit' ? 0 : 1);
  }
});

test('asignaciones: deadlock/timeout se convierten en 409 sin reintentos', async () => {
  for (const failAt of ['deadlock', 'timeout']) {
    const { service, state, admin } = assignmentFixture(); state.failAt = failAt;
    await assert.rejects(service.create(assignmentBody, admin), { status: 409 });
    assert.equal(state.transactions.length, 1); assert.equal(state.assignments.length, 0);
  }
});
