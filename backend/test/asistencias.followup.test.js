import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { followupFixture, monthlyQuery as query, studentIds } from '../test-support/followup-fixture.js';
import { followupDates } from '../src/modules/asistencias/followup.validation.js';

test('tercera incidencia en una semana: combina justificadas, días intercalados y secciones históricas sin cierres', async () => {
  const f = followupFixture(), before = structuredClone(f.state);
  const result = await f.service.monthlyFollowup(query, f.actor('1'));
  assert.equal(result.pagination.total, 3);
  assert.deepEqual(result.estudiantes.map(row => row.estudiante.id), [studentIds[1], studentIds[0], studentIds[2]]);
  const moved = result.estudiantes[1];
  assert.deepEqual([moved.faltas, moved.tardanzas, moved.total, moved.justificadas, moved.injustificadas], [2, 1, 3, 2, 1]);
  assert.deepEqual(moved.secciones.map(row => row.id), ['1', '2']);
  assert.doesNotMatch(JSON.stringify(result), /motivo|historial|version|documento|telefono/);
  assert.deepEqual(f.state, before);
  f.state.years[0].estado = 'CERRADO';
  assert.equal((await f.service.monthlyFollowup(query, f.actor('1'))).pagination.total, 3);
});
test('correcciones vigentes: al bajar de tres desaparece, reactivar vuelve a incluir sin caché ni cierre', async () => {
  const f = followupFixture();
  f.state.marks[2].estado = 'PRESENTE';
  let result = await f.service.monthlyFollowup(query, f.actor('1'));
  assert.equal(result.pagination.total, 2); assert.ok(!result.estudiantes.some(row => row.estudiante.id === studentIds[0]));
  f.state.marks[2].estado = 'PENDIENTE';
  assert.equal((await f.service.monthlyFollowup(query, f.actor('1'))).pagination.total, 2);
  f.state.marks[2].estado = 'TARDANZA';
  result = await f.service.monthlyFollowup(query, f.actor('1'));
  assert.equal(result.pagination.total, 3); assert.equal(result.estudiantes[1].tardanzas, 2);
});
test('permisos antes del umbral: principal sin Inicial implícito, adicionales explícitos y filtro de nivel', async () => {
  const f = followupFixture();
  assert.equal((await f.service.monthlyFollowup(query, f.actor('2'))).pagination.total, 2);
  await assert.rejects(f.service.monthlyFollowup({ ...query, nivel: 'INICIAL' }, f.actor('2')), { status: 403 });
  f.state.additional.push({ usuario_id: '2', nivel: 'INICIAL' });
  assert.equal((await f.service.monthlyFollowup(query, f.actor('2'))).pagination.total, 3);
  assert.equal((await f.service.monthlyFollowup({ ...query, nivel: 'PRIMARIA' }, f.actor('2'))).pagination.total, 2);
  const secondary = await f.service.monthlyFollowup(query, f.actor('3'));
  assert.deepEqual(new Set(secondary.niveles_autorizados), new Set(['INICIAL', 'SECUNDARIA']));
  assert.equal(secondary.pagination.total, 0); // Una incidencia visible no hereda otras dos ajenas.
  await assert.rejects(f.service.monthlyFollowup(query, f.actor('4')), { status: 403 });
  const actor = f.actor('2'); f.state.users[1].activo = 0;
  await assert.rejects(f.service.monthlyFollowup(query, actor), { status: 401 });
});
test('paginación estable por total/nombre/ID y total global, incluso página fuera de resultados', async () => {
  const f = followupFixture();
  for (let page = 1; page <= 4; page++) {
    const result = await f.service.monthlyFollowup({ ...query, page: String(page), limit: '1' }, f.actor('1'));
    assert.deepEqual(result.pagination, { page, limit: 1, total: 3, has_more: page < 3 });
    assert.deepEqual(result.estudiantes.map(row => row.estudiante.id), page <= 3 ? [[studentIds[1]], [studentIds[0]], [studentIds[2]]][page - 1] : []);
  }
});
test('contrato y meses civiles: duplicados/desconocidos, mes fuera del año y recortes/bisiestos', async () => {
  const f = followupFixture();
  for (const input of [{}, { ...query, mes: '2026-13' }, { ...query, mes: ['2026-11', '2026-12'] }, { ...query, mes: '2026-11-01' },
    { ...query, nivel: 'OTRO' }, { ...query, limit: '101' }, { ...query, page: '0' }, { ...query, extra: 'x' }]) {
    await assert.rejects(f.service.monthlyFollowup(input, f.actor('1')), { status: 400 });
  }
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.service.monthlyFollowup({ ...query, mes: '2026-02' }, f.actor('1')), { status: 400 });
  await assert.rejects(f.service.monthlyFollowup({ ...query, anio_escolar_id: '2' }, f.actor('1')), { status: 404 });
  assert.deepEqual(followupDates('2026-03', f.state.years[0]), { fecha_desde: '2026-03-02', fecha_hasta: '2026-03-31' });
  assert.equal(followupDates('2026-12', f.state.years[0]).fecha_hasta, '2026-12-18');
  assert.equal(followupDates('2024-02', { fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' }).fecha_hasta, '2024-02-29');
});
test('snapshot: conteo, página y secciones consistentes ante corrección concurrente; COMMIT incierto sin reintento', async () => {
  const f = followupFixture();
  f.concurrent(state => { state.marks[2].estado = 'PRESENTE'; });
  const result = await f.service.monthlyFollowup(query, f.actor('1'));
  assert.equal(result.pagination.total, 3); assert.equal(result.estudiantes[1].total, 3);
  assert.deepEqual(result.estudiantes[1].secciones.map(row => row.id), ['1', '2']);
  assert.deepEqual(f.events, ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'SET TRANSACTION READ ONLY', 'begin', 'commit', 'release']);
  const failing = followupFixture(); failing.fail('commit');
  await assert.rejects(failing.service.monthlyFollowup(query, failing.actor('1')), /commit/);
  assert.deepEqual(failing.events.slice(-3), ['commit', 'rollback', 'destroy']);
  assert.equal(failing.events.filter(event => event === 'begin').length, 1);
});
test('HTTP: autenticación, REGISTRADOR denegado, no-store, campos inválidos y error seguro', async () => {
  const f = followupFixture();
  const server = createApp({ authService: { authenticate: async token => f.actor(token) }, attendanceService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/asistencias/seguimiento-mensual?${new URLSearchParams(query)}`;
  async function request(token, extra, status) {
    const response = await fetch(base + extra, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
  }
  try {
    assert.equal((await request('1', '', 200)).pagination.total, 3);
    await request('2', '', 200); await request(null, '', 401); await request('4', '', 403);
    await request('2', '&nivel=INICIAL', 403); await request('1', '&mes=2026-12', 400);
    f.fail('read'); assert.deepEqual(await request('1', '', 500), { error: 'No se pudo procesar la solicitud.' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
