import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openingFixture } from '../test-support/anios-open-pool.js';
import { admin, scope } from '../test-support/calendario-fixture.js';

const year = { id: '1', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-01-01', fecha_fin: '2026-11-18' };
const fixture = options => openingFixture({ year: { ...year }, now: () => new Date('2026-11-19T05:00:00Z'), ...options });

test('cierre: día posterior en Lima, estado global y auditoría pública atómica; no consulta pendientes', async () => {
  const { service, state } = fixture(), before = { ...state.year };
  const after = await service.close('1', {}, '1');
  assert.equal(after.estado, 'CERRADO'); assert.equal(after.fecha_fin, before.fecha_fin);
  const calls = state.transactions[0].filter(event => event.sql);
  assert.match(calls[0].sql, /FROM usuarios.*FOR UPDATE$/);
  assert.match(calls[1].sql, /FROM anios_escolares.*FOR UPDATE$/);
  assert.deepEqual(calls[2].params, ['CERRADO', '1', 'ABIERTO']);
  assert.equal(calls.length, 5); assert.equal(state.audits.length, 1);
  assert.deepEqual(state.audits[0].slice(0, 4), ['1', 'CERRAR_ANIO_ESCOLAR', 'anios_escolares', '1']);
  assert.deepEqual(JSON.parse(state.audits[0][4]), before);
  assert.deepEqual(JSON.parse(state.audits[0][5]), after);
  assert.equal(/password|token|NO_AUDITAR/.test(state.audits[0][5]), false);
  assert.deepEqual(state.transactions[0].slice(-2), ['commit', 'release']);
});

test('cierre: antes o durante fecha_fin en Lima rechaza, incluso cuando UTC ya es el día siguiente', async () => {
  for (const instant of ['2026-11-17T23:00:00Z', '2026-11-18T05:00:00Z', '2026-11-19T04:59:59Z']) {
    const { service, state } = fixture({ now: () => new Date(instant) });
    await assert.rejects(service.close('1', undefined, '1'), { status: 409 });
    assert.equal(state.year.estado, 'ABIERTO'); assert.equal(state.audits.length, 0);
  }
});

test('cierre: inexistente, PLANIFICADO y CERRADO no se modifican', async () => {
  for (const [current, status] of [[null, 404], [{ ...year, estado: 'PLANIFICADO' }, 409], [{ ...year, estado: 'CERRADO' }, 409]]) {
    const { service, state } = fixture({ year: current });
    await assert.rejects(service.close('1', {}, '1'), { status }); assert.equal(state.audits.length, 0);
  }
});

test('cierre: contrato estricto y permisos revalidados bajo bloqueo', async () => {
  const f = fixture();
  for (const id of ['0', '01', '18446744073709551616']) await assert.rejects(f.service.close(id, {}, '1'), { status: 400 });
  for (const body of [null, [], { fecha_fin: '2000-01-01' }, { estado: 'CERRADO' }]) await assert.rejects(f.service.close('1', body, '1'), { status: 400 });
  assert.equal(f.state.transactions.length, 0);
  for (const [actor, status] of [[null, 401], [{ ...admin, activo: 0 }, 401], [{ ...admin, rol: 'SUBDIRECCION' }, 403], [{ ...admin, rol: 'REGISTRADOR' }, 403]]) {
    const { service, state } = fixture({ beforeActor: () => state.users.set('1', actor) });
    await assert.rejects(service.close('1', {}, '1'), { status });
    assert.equal(state.transactions[0].includes('year'), false); assert.equal(state.audits.length, 0);
  }
});

test('cierre: solicitudes concurrentes se serializan y auditan una sola transición', async () => {
  const { service, state } = fixture();
  const results = await Promise.allSettled([service.close('1', {}, '1'), service.close('1', {}, '2')]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
  assert.equal(state.audits.length, 1);
});

test('cierre: errores de escritura/auditoría revierten; COMMIT incierto descarta sin reintentar', async () => {
  for (const failAt of ['acquire', 'begin', 'actor', 'year', 'update', 'result', 'audit', 'commit']) {
    const { service, state } = fixture({ failAt });
    await assert.rejects(service.close('1', {}, '1'), error => error === state.error);
    assert.equal(state.year.estado, 'ABIERTO'); assert.equal(state.audits.length, 0);
  }
  const { service, state } = fixture({ commitFailsAfterPersist: true });
  await assert.rejects(service.close('1', {}, '1'), error => error === state.error);
  assert.equal(state.year.estado, 'CERRADO'); assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].at(-1), 'destroy');
});

test('cierre: calendario posterior rechaza escritura y permite consulta sin borrar datos', async () => {
  const { service, state, calendar } = fixture();
  state.periods.push({ id: '10', ...scope, fecha_inicio: '2026-03-01', fecha_fin: '2026-03-31' });
  await service.close('1', {}, '1');
  await assert.rejects(calendar.putException({ ...scope, fecha: '2026-03-02' }, { es_lectivo: false, descripcion: 'Prueba' }, admin), { status: 409 });
  const result = await calendar.effectiveCalendar({ ...scope, desde: '2026-03-02', hasta: '2026-03-02' }, admin);
  assert.equal(result.dias[0].es_lectivo, true); assert.equal(state.periods.length, 1);
});
