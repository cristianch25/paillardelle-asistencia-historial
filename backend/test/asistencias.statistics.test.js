import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { statisticsFixture, statisticsQuery as query } from '../test-support/statistics-fixture.js';

test('estadísticas: estados actuales, justificadas, extremos inclusivos, sesiones abiertas/cerradas e inactivos', async () => {
  const f = statisticsFixture(), before = structuredClone(f.state);
  const result = await f.service.statistics(query, f.actor('1'));
  assert.deepEqual(result.totales, { presentes: 1, tardanzas: 1, faltas: 2, pendientes: 1 });
  assert.equal(result.marcas_registradas, 4); assert.equal(result.sesiones_con_registro, 3);
  assert.deepEqual(new Set(result.niveles_autorizados), new Set(['INICIAL', 'PRIMARIA', 'SECUNDARIA']));
  assert.deepEqual(result.filtros, { ...query, nivel: null });
  assert.doesNotMatch(JSON.stringify(result), /estudiante|nombre|documento|motivo|historial|version/);
  assert.deepEqual(f.state, before);
  f.state.marks[0].estado = 'PENDIENTE';
  assert.equal((await f.service.statistics(query, f.actor('1'))).marcas_registradas, 3);
});
test('ámbito RN-23: principal y adicionales explícitos, sin matriz especial de asistencia', async () => {
  const f = statisticsFixture();
  const primary = await f.service.statistics(query, f.actor('2'));
  assert.deepEqual(primary.niveles_autorizados, ['PRIMARIA']); assert.equal(primary.sesiones_con_registro, 1);
  await assert.rejects(f.service.statistics({ ...query, nivel: 'INICIAL' }, f.actor('2')), { status: 403 });
  const secondary = await f.service.statistics(query, f.actor('3'));
  assert.deepEqual(new Set(secondary.niveles_autorizados), new Set(['INICIAL', 'SECUNDARIA']));
  assert.equal(secondary.sesiones_con_registro, 2);
  assert.equal((await f.service.statistics({ ...query, nivel: 'INICIAL' }, f.actor('3'))).totales.tardanzas, 1);
  await assert.rejects(f.service.statistics({ ...query, nivel: 'PRIMARIA' }, f.actor('3')), { status: 403 });
  f.state.additional.push({ usuario_id: '2', nivel: 'INICIAL' });
  assert.equal((await f.service.statistics(query, f.actor('2'))).sesiones_con_registro, 2);
});
test('actores: REGISTRADOR denegado, cuenta revocada y rol revalidado en snapshot', async () => {
  const f = statisticsFixture();
  await assert.rejects(f.service.statistics(query, f.actor('4')), { status: 403 });
  await assert.rejects(f.service.statistics(query, null), { status: 401 });
  assert.equal(f.calls.length, 0);
  const actor = f.actor('2'); f.state.users[1].activo = 0;
  await assert.rejects(f.service.statistics(query, actor), { status: 401 });
  f.state.users[1].activo = 1; f.state.users[1].rol = 'REGISTRADOR';
  await assert.rejects(f.service.statistics(query, actor), { status: 403 });
});
test('contrato: parámetros faltantes, duplicados, desconocidos y fechas reales ordenadas', async () => {
  const f = statisticsFixture();
  for (const input of [{}, { ...query, anio_escolar_id: '01' }, { ...query, fecha_desde: '2026-02-29' },
    { ...query, fecha_hasta: '2026-11-31' }, { ...query, fecha_desde: ['2026-11-01', '2026-11-02'] },
    { ...query, fecha_hasta: '2026-10-31' }, { ...query, nivel: ['PRIMARIA', 'INICIAL'] },
    { ...query, nivel: 'OTRO' }, { ...query, fecha: '2026-11-01' }]) {
    await assert.rejects(f.service.statistics(input, f.actor('1')), { status: 400 });
  }
  assert.equal(f.calls.length, 0);
  for (const input of [{ ...query, fecha_desde: '2026-03-01' }, { ...query, fecha_hasta: '2026-12-19' }]) {
    await assert.rejects(f.service.statistics(input, f.actor('1')), { status: 400 });
  }
  await assert.rejects(f.service.statistics({ ...query, anio_escolar_id: '2' }, f.actor('1')), { status: 404 });
});
test('vacío, solo pendientes, día futuro y año cerrado no generan datos artificiales', async () => {
  const f = statisticsFixture();
  const empty = await f.service.statistics({ ...query, fecha_desde: '2026-12-18', fecha_hasta: '2026-12-18' }, f.actor('1'));
  assert.deepEqual(empty.totales, { presentes: 0, tardanzas: 0, faltas: 0, pendientes: 0 });
  assert.equal(empty.sesiones_con_registro, 0); assert.equal(empty.marcas_registradas, 0);
  f.state.marks.forEach(row => { row.estado = 'PENDIENTE'; row.justificada = 0; });
  const pending = await f.service.statistics(query, f.actor('1'));
  assert.equal(pending.marcas_registradas, 0); assert.equal(pending.totales.pendientes, 5);
});
test('snapshot: actor, adicionales, año y agregado comparten READ ONLY/REPEATABLE READ sin bloqueos', async () => {
  const f = statisticsFixture();
  f.concurrent(state => { state.additional = []; state.marks[0].estado = 'FALTA'; });
  const result = await f.service.statistics(query, f.actor('3'));
  assert.equal(result.totales.presentes, 1); assert.ok(result.niveles_autorizados.includes('INICIAL'));
  assert.deepEqual(f.events, ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'SET TRANSACTION READ ONLY', 'begin', 'commit', 'release']);
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls.filter(call => call.sql.includes('COUNT(DISTINCT')).length, 1);
});
test('transacción: fallo de lectura revierte; COMMIT incierto descarta conexión sin reintentar', async () => {
  for (const failure of ['read', 'commit', 'setup']) {
    const f = statisticsFixture(); f.fail(failure);
    await assert.rejects(f.service.statistics(query, f.actor('1')));
    assert.deepEqual(f.events.slice(-1), [failure === 'read' ? 'release' : 'destroy']);
    assert.ok(f.events.filter(event => event === 'begin').length <= 1);
    if (failure === 'commit') assert.deepEqual(f.events.slice(-3), ['commit', 'rollback', 'destroy']);
  }
});
test('HTTP: ruta autenticada, roles, filtros duplicados, no-store y error seguro', async () => {
  const f = statisticsFixture();
  const server = createApp({ authService: { authenticate: async token => f.actor(token) }, attendanceService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/asistencias/estadisticas?${new URLSearchParams(query)}`;
  async function request(token, extra = '', status = 200) {
    const response = await fetch(base + extra, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
  }
  try {
    assert.equal((await request('1')).marcas_registradas, 4);
    await request(null, '', 401); await request('4', '', 403);
    await request('2', '&nivel=INICIAL', 403); await request('3', '&nivel=INICIAL');
    await request('1', '&fecha_desde=2026-11-02', 400); await request('1', '&otro=x', 400);
    f.fail('read'); assert.deepEqual(await request('1', '', 500), { error: 'No se pudo procesar la solicitud.' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
