import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarFixture, admin, periodBody, scope } from '../test-support/calendario-fixture.js';

const block = { ...scope, fecha_inicio: '2026-03-02', fecha_fin: '2026-03-04', descripcion: 'Suspensión' };

test('calendario SQL: parámetros, columnas explícitas y orden actor/año/filas/asistencias/auditoría', async () => {
  const { service, state } = calendarFixture();
  const row = await service.createPeriod(periodBody, admin);
  const calls = state.transactions[0].filter(item => item.sql);
  assert.match(calls[0].sql, /FROM usuarios WHERE id = \? LIMIT 1 FOR UPDATE$/);
  assert.match(calls[1].sql, /FROM anios_escolares WHERE id = \? LIMIT 1 FOR UPDATE$/);
  assert.match(calls[2].sql, /FROM periodos_lectivos.*ORDER BY id FOR UPDATE$/);
  assert.match(calls[3].sql, /FROM calendario_lectivo.*ORDER BY id FOR UPDATE$/);
  assert.deepEqual(calls.find(item => item.sql.startsWith('INSERT INTO periodos')).params,
    ['1', 'PRIMARIA', periodBody.fecha_inicio, periodBody.fecha_fin]);
  assert.deepEqual(state.audits[0].slice(0, 5), ['1', 'CREAR_PERIODO_LECTIVO', 'periodos_lectivos', row.id, null]);
  assert.deepEqual(JSON.parse(state.audits[0][5]), row);
  assert.equal(calls.some(item => /SELECT \*|password_hash/.test(item.sql)), false);
  assert.deepEqual(state.transactions[0].slice(-2), ['commit', 'release']);
  await service.blockRange(block, admin);
  const attendance = state.transactions.at(-1).find(item => item.sql?.includes('FROM asistencias a'));
  assert.deepEqual(attendance.params, ['1', 'PRIMARIA', block.fecha_inicio, block.fecha_fin]);
  assert.match(attendance.sql, /ms.matricula_id = a.matricula_id/);
  assert.match(attendance.sql, /ORDER BY a.id FOR UPDATE$/);
});

test('calendario: dos actores creando primeros períodos solapados quedan serializados por el año', async () => {
  const { service, state } = calendarFixture();
  const results = await Promise.allSettled([service.createPeriod(periodBody, admin),
    service.createPeriod({ ...periodBody, fecha_inicio: '2026-04-01' }, { ...admin, id: '2' })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
  assert.equal(state.periods.length, 1); assert.equal(state.audits.length, 1);
});

test('calendario: modificaciones concurrentes releen el período actual bajo bloqueo común', async () => {
  const { service, state } = calendarFixture();
  const row = await service.createPeriod(periodBody, admin);
  await Promise.all([service.updatePeriod(row.id, { fecha_inicio: '2026-03-03' }, admin),
    service.updatePeriod(row.id, { fecha_fin: '2026-12-17' }, { ...admin, id: '2' })]);
  assert.equal(state.periods[0].fecha_inicio, '2026-03-03');
  assert.equal(state.periods[0].fecha_fin, '2026-12-17');
  assert.equal(state.audits.length, 3);
});

test('calendario: dos PUT concurrentes de la primera excepción conservan una fila y auditan ambos cambios', async () => {
  const { service, state } = calendarFixture();
  const params = { ...scope, fecha: '2026-03-03' };
  await Promise.all([service.putException(params, { es_lectivo: true, descripcion: 'Recuperación' }, admin),
    service.putException(params, { es_lectivo: false, descripcion: 'Suspensión' }, { ...admin, id: '2' })]);
  assert.equal(state.exceptions.length, 1); assert.equal(state.exceptions[0].es_lectivo, false);
  assert.equal(state.audits.length, 2); assert.notEqual(state.audits[1][4], null);
});

test('calendario: revocación/desactivación mientras espera invalida al actor antes de escribir', async () => {
  for (const [user, status] of [[null, 401], [{ ...admin, activo: 0 }, 401],
    [{ ...admin, rol: 'REGISTRADOR' }, 403],
    [{ ...admin, rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA' }, 403]]) {
    let entered, resume;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { resume = resolve; });
    const { service, state } = calendarFixture({ beforeActor: async () => { entered(); await gate; } });
    const rejection = assert.rejects(service.createPeriod(periodBody, admin), { status });
    await waiting; state.users.set('1', user); resume(); await rejection;
    assert.equal(state.periods.length, 0); assert.equal(state.audits.length, 0);
    assert.equal(state.transactions[0].includes('year'), false);
  }
});

test('calendario: revalida adicionales, cierre concurrente y asistencias insertadas antes del bloqueo', async () => {
  const { service, state } = calendarFixture();
  const sub = { ...admin, id: '3', rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA' };
  state.users.set('3', sub); state.additional.set('3', ['PRIMARIA']);
  state.beforeActor = async () => state.additional.set('3', []);
  await assert.rejects(service.createPeriod(periodBody, sub), { status: 403 });
  state.beforeActor = null;
  state.beforeYear = async () => { state.year.estado = 'CERRADO'; };
  await assert.rejects(service.createPeriod(periodBody, admin), { status: 409 });
  state.beforeYear = async () => {
    state.year.estado = 'ABIERTO'; state.attendance.push({ ...scope, fecha: '2026-03-04' });
  };
  await assert.rejects(service.blockRange(block, admin), { status: 409 });
  assert.equal(state.exceptions.length, 0); assert.equal(state.audits.length, 0);
});

test('calendario: fallos de cada fase revierten también rangos parciales y conservan el error principal', async () => {
  for (const failAt of ['acquire', 'begin', 'actor', 'year', 'select', 'attendance', 'insert', 'audit']) {
    const { service, state } = calendarFixture({ failAt });
    await assert.rejects(service.blockRange(block, admin), error => error === state.error);
    assert.equal(state.exceptions.length, 0); assert.equal(state.audits.length, 0);
  }
  const { service, state } = calendarFixture({ failAt: 'audit', rollbackFails: true, destroyFails: true });
  await assert.rejects(service.blockRange(block, admin), error => error === state.error);
  assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'destroy']);
});

test('calendario: fallo de una auditoría intermedia revierte todo el rango', async () => {
  const { service, state } = calendarFixture();
  const acquire = state.pool.getConnection.bind(state.pool);
  state.pool.getConnection = async () => {
    const connection = await acquire(), execute = connection.execute.bind(connection);
    let audits = 0;
    connection.execute = (sql, params) => {
      if (sql.startsWith('INSERT INTO auditoria') && ++audits === 2) throw state.error;
      return execute(sql, params);
    };
    return connection;
  };
  await assert.rejects(service.blockRange(block, admin), error => error === state.error);
  assert.equal(state.exceptions.length, 0); assert.equal(state.audits.length, 0);
});

test('calendario: COMMIT incierto descarta sin reintento aunque pudiera persistir; release no revierte', async () => {
  for (const options of [{ failAt: 'commit' }, { commitFailsAfterPersist: true },
    { failAt: 'commit', rollbackFails: true, destroyFails: true }, { releaseFails: true }]) {
    const { service, state } = calendarFixture(options);
    await assert.rejects(service.createPeriod(periodBody, admin), error =>
      error === (options.releaseFails ? state.cleanup : state.error));
    assert.equal(state.transactions.length, 1);
    const events = state.transactions[0];
    assert.equal(events.at(-1), 'destroy');
    assert.equal(events.filter(row => row === 'commit').length, 1);
    assert.equal(state.periods.length, options.commitFailsAfterPersist || options.releaseFails ? 1 : 0);
  }
});

test('calendario: duplicado/deadlock/timeout producen 409 sin reintentos', async () => {
  for (const code of ['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const { service, state } = calendarFixture({ failAt: 'year', error: Object.assign(new Error('Privado'), { code }) });
    await assert.rejects(service.createPeriod(periodBody, admin), { status: 409 });
    assert.equal(state.transactions.length, 1); assert.equal(state.periods.length, 0);
  }
});

test('calendario: lectura del calendario y listados retienen FOR SHARE sobre el año', async () => {
  const { service, state } = calendarFixture();
  await service.effectiveCalendar({ ...scope, desde: '2026-03-01', hasta: '2026-03-01' }, admin);
  await service.listPeriods(scope, admin);
  await service.listExceptions({ ...scope, desde: '2026-03-01', hasta: '2026-03-31', limit: '2', page: '2' }, admin);
  for (const transaction of state.transactions) {
    const calls = transaction.filter(item => item.sql);
    assert.match(calls[0].sql, /FROM anios_escolares.*FOR SHARE$/);
    assert.deepEqual(transaction.slice(-2), ['commit', 'release']);
  }
  const query = state.transactions.at(-1).find(item => item.sql?.includes('FROM calendario_lectivo'));
  assert.match(query.sql, /fecha BETWEEN \? AND \? ORDER BY id ASC LIMIT \? OFFSET \?$/);
  assert.deepEqual(query.params, ['1', 'PRIMARIA', '2026-03-01', '2026-03-31', 3, 2]);
});
