import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares.repository.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares.service.js';
import { payload, yearPool } from '../test-support/anios-create-pool.js';

function fixture(options) {
  const state = yearPool(options);
  const repository = createAniosEscolaresRepository(() => state.pool);
  return { state, service: createAniosEscolaresService({ repository }) };
}

test('alta: actor bloqueado, INSERT y auditoría en una conexión y transacción, sin secretos', async () => {
  const { service, state } = fixture();
  const year = await service.create(payload, '1');
  assert.equal(year.id, '9007199254740993');
  assert.equal(year.estado, 'PLANIFICADO');
  assert.equal(state.transactions.length, 1);
  const events = state.transactions[0];
  assert.equal(events[0], 'begin');
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
  const sql = events.filter(item => item.sql);
  assert.equal(sql[0].sql, 'SELECT id, rol, activo FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE');
  assert.deepEqual(sql[0].params, ['1']);
  assert.deepEqual(sql[1].params, [2026, payload.fecha_inicio, payload.fecha_fin, 'PLANIFICADO']);
  assert.deepEqual(sql[2].params, [year.id]);
  assert.equal(sql.some(item => /SELECT \*|UPDATE |DELETE /.test(item.sql)), false);
  const [actor, action, entity, id, before, after] = state.audits[0];
  assert.deepEqual([actor, action, entity, id, before], ['1', 'CREAR_ANIO_ESCOLAR', 'anios_escolares', year.id, null]);
  assert.deepEqual(JSON.parse(after), year);
  assert.equal(/password|token|NO_AUDITAR/.test(after), false);
});

test('duplicados secuenciales y solicitudes concurrentes generan 409 y una sola auditoría', async () => {
  const { service, state } = fixture();
  const results = await Promise.allSettled([service.create(payload, '1'), service.create(payload, '1')]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.status, 409);
  await assert.rejects(service.create(payload, '1'), { status: 409 });
  assert.equal(state.years.length, 1);
  assert.equal(state.audits.length, 1);
});

test('no impone restricciones por otro año abierto, fechas superpuestas ni año de las fechas', async () => {
  const { service, state } = fixture();
  state.years.push({ ...payload, id: '8', anio: 2025, estado: 'ABIERTO' });
  assert.equal((await service.create(payload, '1')).estado, 'PLANIFICADO');
  assert.equal(state.years.length, 2);
});

test('revalida actor tras esperar bloqueo: inexistente/inactivo 401 y rol revocado 403, sin insertar', async () => {
  for (const [actor, status] of [[null, 401], [{ activo: 0, rol: 'ADMIN' }, 401],
    [{ activo: 1, rol: 'SUBDIRECCION' }, 403], [{ activo: 1, rol: 'REGISTRADOR' }, 403]]) {
    let entered, proceed;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { proceed = resolve; });
    const { service, state } = fixture({ beforeActorRead: async () => { entered(); await gate; } });
    const result = service.create(payload, '1');
    const rejected = assert.rejects(result, { status });
    await waiting;
    state.actor = actor;
    proceed();
    await rejected;
    assert.equal(state.years.length, 0);
    assert.equal(state.audits.length, 0);
    assert.equal(state.transactions[0].includes('insert'), false);
    assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
});

test('fallos simulados antes de persistir: rollback y descarte si falla COMMIT', async () => {
  for (const failAt of ['acquire', 'begin', 'actor', 'insert', 'select', 'audit', 'commit']) {
    const { service, state } = fixture({ failAt });
    await assert.rejects(service.create(payload, '1'), error => error === state.error);
    assert.equal(state.years.length, 0);
    assert.equal(state.audits.length, 0);
    if (failAt === 'commit') assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'destroy']);
    else if (failAt !== 'acquire') assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
  for (const options of [{ missingRow: true }, { affectedRows: 0 }]) {
    const { service, state } = fixture(options);
    await assert.rejects(service.create(payload, '1'));
    assert.equal(state.years.length, 0);
    assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
});

test('rollback/release/destroy fallidos preservan el error principal y descartan conexiones', async () => {
  for (const options of [{ rollbackFails: true }, { rollbackFails: true, destroyFails: true },
    { releaseFails: true, destroyFails: true }]) {
    const { service, state } = fixture({ failAt: 'audit', ...options });
    await assert.rejects(service.create(payload, '1'), error => error === state.error);
    assert.equal(state.transactions[0].at(-1), 'destroy');
    assert.equal(state.years.length, 0);
    if (options.rollbackFails) assert.equal(state.transactions[0].includes('release'), false);
  }
});

test('COMMIT fallido descarta siempre, incluso si rollback/destroy fallan, sin reintentar', async () => {
  for (const options of [{}, { rollbackFails: true }, { destroyFails: true },
    { rollbackFails: true, destroyFails: true }]) {
    const { service, state } = fixture({ failAt: 'commit', ...options });
    await assert.rejects(service.create(payload, '1'), error => error === state.error);
    assert.equal(state.transactions.length, 1);
    const events = state.transactions[0];
    assert.deepEqual(events.slice(-3), ['commit', 'rollback', 'destroy']);
    assert.equal(events.includes('release'), false);
    assert.equal(events.filter(event => event === 'commit').length, 1);
  }
});

test('COMMIT puede persistir y fallar al confirmar: rollback no prueba reversión y se descarta', async () => {
  const { service, state } = fixture({ commitFailsAfterPersist: true });
  await assert.rejects(service.create(payload, '1'), error => error === state.error);
  assert.equal(state.years.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.transactions.length, 1);
  assert.deepEqual(state.transactions[0].slice(-3), ['commit', 'rollback', 'destroy']);
  assert.equal(state.transactions[0].includes('release'), false);
});

test('release fallido después de COMMIT conserva la creación confirmada y no reintenta', async () => {
  const { service, state } = fixture({ releaseFails: true, destroyFails: true });
  await assert.rejects(service.create(payload, '1'), error => error === state.cleanup);
  assert.equal(state.years.length, 1);
  assert.equal(state.audits.length, 1);
  assert.deepEqual(state.transactions[0].slice(-3), ['commit', 'release', 'destroy']);
});

test('deadlock y timeout se traducen a conflictos 409 sin reintentos automáticos', async () => {
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const { service, state } = fixture({ failAt: 'actor', error: Object.assign(new Error('Privado'), { code }) });
    await assert.rejects(service.create(payload, '1'), { status: 409 });
    assert.equal(state.transactions.length, 1);
    assert.equal(state.years.length, 0);
  }
});
