import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { followupFixture, monthlyQuery, studentIds } from '../test-support/followup-fixture.js';

const query = { ...monthlyQuery, page: '1', limit: '5' };
const assign = (f, section, start = '2026-11-01', end = null, user = '4') => f.state.assignments.push({
  usuario_id: user, seccion_id: section, fecha_inicio: start, fecha_fin: end });

test('REGISTRADOR: ámbito por sección antes del umbral, sin heredar nivel principal ni adicionales', async () => {
  const f = followupFixture(); assign(f, '1');
  f.state.users[3].nivel_asignado = 'SECUNDARIA'; f.state.additional.push({ usuario_id: '4', nivel: 'INICIAL' });
  assign(f, '3', '2026-11-01', null, '2');
  const result = await f.service.monthlyFollowup(query, f.actor('4'));
  assert.deepEqual(result.estudiantes.map(row => row.estudiante.id), [studentIds[1]]);
  assert.equal(result.estudiantes[0].total, 4);
  assert.deepEqual(result.estudiantes[0].secciones.map(row => row.id), ['1']);
  assert.deepEqual(result.niveles_autorizados, ['PRIMARIA']);
  assert.equal(f.calls.some(call => call.sql.includes('usuario_niveles_adicionales')), false);
  const sources = f.calls.filter(call => call.sql.includes('FROM asistencias a'));
  assert.equal(sources.length, 3); // Conteo, cinco resultados y secciones en bloque.
  assert.ok(sources.every(call => call.params.slice(3, 7).join('|') === '4|2026-11-21|2026-11-21|4'));
  assert.doesNotMatch(JSON.stringify(result), /telefono|motivo|hash|historial|documento/);
});

test('cambio de sección: agrupa por identidad y cada incidencia se autoriza por su sección histórica', async () => {
  const f = followupFixture(); assign(f, '1');
  assign(f, '2', '2026-11-04', '2026-11-06'); assign(f, '2', '2026-11-21', null);
  const before = structuredClone(f.state);
  const result = await f.service.monthlyFollowup(query, f.actor('4'));
  const moved = result.estudiantes.find(row => row.estudiante.id === studentIds[0]);
  assert.deepEqual([moved.total, moved.faltas, moved.tardanzas, moved.justificadas], [3, 2, 1, 2]);
  assert.deepEqual(moved.secciones.map(row => row.id), ['1', '2']);
  assert.equal(result.estudiantes.filter(row => row.estudiante.id === studentIds[0]).length, 1);
  assert.deepEqual(f.state, before);
  // Incluso con enlaces repetidos de prueba, EXISTS no multiplica marcas.
  f.state.assignments.push(...structuredClone(f.state.assignments));
  assert.deepEqual(await f.service.monthlyFollowup(query, f.actor('4')), result);
});

test('vigencias independientes hoy y en cada fecha, extremos inclusivos y períodos discontinuos', async () => {
  const f = followupFixture(); assign(f, '1', '2026-11-02', '2026-11-04');
  assert.equal((await f.service.monthlyFollowup(query, f.actor('4'))).pagination.total, 0);
  assign(f, '1', '2026-11-22', null); // Futuro no concede acceso hoy.
  assert.equal((await f.service.monthlyFollowup(query, f.actor('4'))).pagination.total, 0);
  assign(f, '1', '2026-11-21', '2026-11-21');
  const result = await f.service.monthlyFollowup(query, f.actor('4'));
  assert.equal(result.estudiantes[0].total, 3); // 2, 3 y 4; excluye el día 5.
  f.state.assignments = f.state.assignments.filter(row => row.fecha_inicio === '2026-11-21');
  assert.equal((await f.service.monthlyFollowup(query, f.actor('4'))).pagination.total, 0);
});

test('cinco resultados como máximo, orden descendente y sin abrir consulta institucional por filtros', async () => {
  const f = followupFixture(); assign(f, '1');
  for (let index = 0; index < 7; index++) {
    const id = String(100 + index); f.state.students.push({ id, apellido_paterno: 'Prueba', apellido_materno: null, nombres: id });
    for (let day = 1; day <= index + 3; day++) f.state.marks.push({ estudiante_id: id, anio_escolar_id: '1',
      seccion_id: '1', fecha: `2026-11-${String(day).padStart(2, '0')}`, estado: 'FALTA', justificada: 0 });
  }
  const result = await f.service.monthlyFollowup(query, f.actor('4'));
  assert.equal(result.estudiantes.length, 5);
  assert.deepEqual(result.estudiantes.map(row => row.total), [9, 8, 7, 6, 5]);
  assert.equal(result.pagination.has_more, true);
  for (const patch of [{ limit: '6' }, { page: '2' }, { nivel: 'PRIMARIA' }]) {
    await assert.rejects(f.service.monthlyFollowup({ ...query, ...patch }, f.actor('4')), { status: 403 });
  }
});

test('actor revalidado y snapshot de asignaciones; revocación no se conserva en otra consulta', async () => {
  const f = followupFixture(); assign(f, '1');
  f.concurrent(state => { state.assignments = []; });
  assert.equal((await f.service.monthlyFollowup(query, f.actor('4'))).pagination.total, 1);
  assert.equal((await f.service.monthlyFollowup(query, f.actor('4'))).pagination.total, 0);
  const actor = f.actor('4'); f.state.users[3].activo = 0;
  await assert.rejects(f.service.monthlyFollowup(query, actor), { status: 401 });
  f.state.users[3].activo = 1; f.state.users[3].rol = 'SUPERUSUARIO';
  await assert.rejects(f.service.monthlyFollowup(query, actor), { status: 403 });
});

test('HTTP: solo seguimiento acotado; Estadísticas generales continúan denegadas', async () => {
  const f = followupFixture(); assign(f, '1');
  const server = createApp({ authService: { authenticate: async token => f.actor(token) }, attendanceService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/asistencias`;
  const request = (path, token = '4') => fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
  try {
    const response = await request(`/seguimiento-mensual?${new URLSearchParams(query)}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).estudiantes[0].total, 4);
    assert.equal((await request('/estadisticas?anio_escolar_id=1&fecha_desde=2026-11-01&fecha_hasta=2026-11-30')).status, 403);
    assert.equal((await request(`/seguimiento-mensual?${new URLSearchParams({ ...query, nivel: 'INICIAL' })}`)).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
