import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openingFixture } from '../test-support/anios-open-pool.js';
import { admin, periodBody, scope } from '../test-support/calendario-fixture.js';

test('apertura: PLANIFICADO a ABIERTO, BIGINT unsigned como texto y auditoría pública antes/después', async () => {
  const { service, state } = openingFixture();
  state.year.id = '9223372036854775808';
  const before = { ...state.year };
  const row = await service.open(state.year.id, {}, '1');
  assert.equal(row.id, before.id); assert.equal(row.estado, 'ABIERTO');
  assert.equal(row.anio, before.anio); assert.equal(row.fecha_inicio, before.fecha_inicio); assert.equal(row.fecha_fin, before.fecha_fin);
  const calls = state.transactions[0].filter(item => item.sql);
  assert.match(calls[0].sql, /FROM usuarios WHERE id = \? LIMIT 1 FOR UPDATE$/);
  assert.match(calls[1].sql, /FROM anios_escolares WHERE id = \? LIMIT 1 FOR UPDATE$/);
  assert.deepEqual(calls[2].params, ['ABIERTO', before.id, 'PLANIFICADO']);
  assert.deepEqual(calls[3].params, [before.id]);
  assert.deepEqual(state.audits[0].slice(0, 4), ['1', 'ABRIR_ANIO_ESCOLAR', 'anios_escolares', before.id]);
  assert.deepEqual(JSON.parse(state.audits[0][4]), before);
  assert.deepEqual(JSON.parse(state.audits[0][5]), row);
  assert.equal(/password|token|NO_AUDITAR/.test(state.audits[0][5]), false);
  assert.equal(state.transactions.length, 1); assert.deepEqual(state.transactions[0].slice(-2), ['commit', 'release']);
});

test('apertura: año inexistente 404, ABIERTO/CERRADO 409, sin UPDATE ni auditoría', async () => {
  for (const [year, status] of [[null, 404], [{ id: '1', estado: 'ABIERTO' }, 409], [{ id: '1', estado: 'CERRADO' }, 409]]) {
    const { service, state } = openingFixture({ year });
    await assert.rejects(service.open('1', undefined, '1'), { status });
    assert.equal(state.audits.length, 0); assert.equal(state.transactions[0].includes('update'), false);
    assert.deepEqual(state.transactions[0].slice(-2), ['rollback', 'release']);
  }
});

test('apertura: no exige fecha actual, períodos, secciones o asignaciones ni exclusividad de año abierto', async () => {
  const { service, state } = openingFixture(); state.sections = [];
  state.year.anio = 2000; state.year.fecha_inicio = '2000-01-01'; state.year.fecha_fin = '2000-12-31';
  assert.equal((await service.open('1', undefined, '1')).estado, 'ABIERTO');
  assert.equal(state.periods.length, 0); assert.equal(state.exceptions.length, 0);
  const sql = state.transactions[0].filter(item => item.sql).map(item => item.sql).join('\n');
  assert.equal(/FROM secciones|FROM asignaciones|FROM periodos_lectivos|COUNT\(/.test(sql), false);
});

test('apertura: IDs inválidos y campos en cuerpo se rechazan antes de adquirir conexión', async () => {
  const { service, state } = openingFixture();
  for (const id of ['0', '01', '18446744073709551616', 1]) await assert.rejects(service.open(id, {}, '1'), { status: 400 });
  for (const body of [null, [], true, 'abrir', { estado: 'ABIERTO' }, { nivel: 'INICIAL' }, { fecha_inicio: '2026-01-01' }]) {
    await assert.rejects(service.open('1', body, '1'), { status: 400 });
  }
  assert.equal(state.transactions.length, 0);
});

test('apertura: revalida actividad y rol del actor; SUBDIRECCION no abre aunque tenga todos los niveles', async () => {
  for (const [actor, status] of [[null, 401], [{ ...admin, activo: 0 }, 401],
    [{ ...admin, rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }, 403], [{ ...admin, rol: 'REGISTRADOR' }, 403]]) {
    let entered, resume;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { resume = resolve; });
    const { service, state } = openingFixture({ beforeActor: async () => { entered(); await gate; } });
    state.additional.set('1', ['SECUNDARIA', 'INICIAL']);
    const rejection = assert.rejects(service.open('1', {}, '1'), { status });
    await waiting; state.users.set('1', actor); resume(); await rejection;
    assert.equal(state.year.estado, 'PLANIFICADO'); assert.equal(state.audits.length, 0);
    assert.equal(state.transactions[0].includes('year'), false);
  }
});

test('apertura: dos solicitudes de ADMIN diferentes se serializan por el año; una 200 y otra 409', async () => {
  const { service, state } = openingFixture();
  const results = await Promise.allSettled([service.open('1', {}, '1'), service.open('1', {}, '2')]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.status, 409);
  assert.equal(state.year.estado, 'ABIERTO'); assert.equal(state.audits.length, 1);
});

test('apertura: fallo en adquisición, BEGIN, actor, año, UPDATE, resultado o auditoría revierte estado', async () => {
  for (const failAt of ['acquire', 'begin', 'actor', 'year', 'update', 'result', 'audit']) {
    const { service, state } = openingFixture({ failAt });
    await assert.rejects(service.open('1', {}, '1'), error => error === state.error);
    assert.equal(state.year.estado, 'PLANIFICADO'); assert.equal(state.audits.length, 0);
  }
  for (const options of [{ missingResult: true }, { affectedRows: 0 }]) {
    const { service, state } = openingFixture(options);
    await assert.rejects(service.open('1', {}, '1'));
    assert.equal(state.year.estado, 'PLANIFICADO'); assert.equal(state.audits.length, 0);
  }
});

test('apertura: COMMIT incierto descarta sin reintento, rollback fallido preserva el error principal', async () => {
  for (const options of [{ failAt: 'commit' }, { commitFailsAfterPersist: true }, { releaseFails: true },
    { failAt: 'audit', rollbackFails: true, destroyFails: true }]) {
    const { service, state } = openingFixture(options);
    await assert.rejects(service.open('1', {}, '1'), error => error === (options.releaseFails ? state.cleanup : state.error));
    assert.equal(state.transactions.length, 1); assert.equal(state.transactions[0].at(-1), 'destroy');
    assert.equal(state.year.estado, options.commitFailsAfterPersist || options.releaseFails ? 'ABIERTO' : 'PLANIFICADO');
  }
});

test('apertura: deadlock y timeout reciben 409 sin reintentar ni auditar', async () => {
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const { service, state } = openingFixture({ failAt: 'year', error: Object.assign(new Error('Privado'), { code }) });
    await assert.rejects(service.open('1', {}, '1'), { status: 409 });
    assert.equal(state.transactions.length, 1); assert.equal(state.year.estado, 'PLANIFICADO'); assert.equal(state.audits.length, 0);
  }
});

test('apertura: compatible con escritor concurrente de calendario, sin alterar períodos ni excepciones', async () => {
  const { service, state, calendar } = openingFixture();
  await Promise.all([service.open('1', {}, '1'), calendar.createPeriod(periodBody, { ...admin, id: '2' })]);
  assert.equal(state.year.estado, 'ABIERTO'); assert.equal(state.periods.length, 1); assert.equal(state.audits.length, 2);
  const saved = structuredClone(state.periods);
  await calendar.putException({ ...scope, fecha: '2026-03-07' }, { es_lectivo: true, descripcion: 'Recuperación' }, admin);
  const result = await calendar.effectiveCalendar({ ...scope, desde: '2026-03-07', hasta: '2026-03-07' }, admin);
  assert.equal(result.dias[0].es_lectivo, true); assert.deepEqual(state.periods, saved);
});
