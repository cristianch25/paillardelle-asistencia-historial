import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { data, selection } from './support/attendanceFixture.mjs';

let vite, http, load, Summary, View;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  ({ getSectionAttendanceSummaries: load } = await vite.ssrLoadModule('/src/features/asistencias/sectionAttendanceSummaries.api.ts'));
  Summary = (await vite.ssrLoadModule('/src/features/asistencias/SectionAttendanceSummary.tsx')).default;
  View = (await vite.ssrLoadModule('/src/features/asistencias/AsistenciaSessionView.tsx')).default;
});
after(async () => { await vite?.close(); });
const date = '2026-11-16', year = selection.year;
const section = id => ({ ...selection.section, id });
const item = (id, changes = {}) => ({ seccion: section(id), es_lectivo: true, situacion: 'ABIERTA',
  sesion_id: `100${id}`, resumen: structuredClone(data.resumen), ...changes });
const response = (config, rows, more = false) => ({ config, status: 200, headers: {}, data: {
  anio_escolar_id: config.params.anio_escolar_id, fecha: config.params.fecha, secciones: rows,
  pagination: { page: config.params.page, limit: 100, has_more: more },
} });

test('agrupa secciones por año; pagina hasta resolver las visibles sin GET por tarjeta', async () => {
  const calls = [];
  http.defaults.adapter = async config => {
    calls.push(config.params);
    assert.equal(config.method, 'get'); assert.equal(config.url, '/asistencias/sesiones');
    return response(config, config.params.page === 1 ? [item('1'), item('2')] : [item('3'), item('4')], config.params.page === 1);
  };
  const result = await load(['1', '2', '3'].map(section), [year], date, () => true);
  assert.equal(calls.length, 2); assert.ok(calls.every(c => !c.seccion_id && c.limit === 100));
  assert.deepEqual(result['3'], { status: 'ready', item: item('3') });
  calls.length = 0;
  await load(['1', '2'].map(section), [year], date, () => true);
  assert.equal(calls.length, 1);
});

test('año fuera de intervalo o inexistente no genera solicitudes ni ceros; sección omitida es error', async () => {
  let calls = 0;
  http.defaults.adapter = async config => { calls++; return response(config, []); };
  const result = await load([section('1'), { ...section('2'), anio_escolar_id: '99' }],
    [{ ...year, fecha_fin: '2026-10-31' }], date, () => true);
  assert.equal(calls, 0); assert.equal(result['1'].status, 'outside-year'); assert.equal(result['2'].status, 'error');
  assert.equal((await load([section('1')], [year], date, () => true))['1'].status, 'error');
});

test('errores, contrato inconsistente y paginación repetida no publican resultados parciales', async () => {
  for (const fail of ['network', 'identity', 'duplicate', 'pagination', 'counts']) {
    http.defaults.adapter = async config => {
      if (fail === 'network') throw new Error('Detalle privado');
      const result = response(config, [item('1')], fail === 'duplicate');
      if (fail === 'identity') result.data.fecha = '2026-11-15';
      if (fail === 'pagination') result.data.pagination.page = 9;
      if (fail === 'counts') result.data.secciones[0].resumen.total = -1;
      return result;
    };
    const result = await load([section('1'), section('2')], [year], date, () => true);
    assert.ok(Object.values(result).every(value => value.status === 'error'), fail);
  }
});

test('invalidación durante respuesta detiene páginas y descarta datos tardíos', async () => {
  let current = true, calls = 0;
  http.defaults.adapter = async config => { calls++; current = false; return response(config, [item('1')], true); };
  assert.equal(await load([section('2')], [year], date, () => current), null); assert.equal(calls, 1);
});

test('varios años usan consultas independientes y un fallo no inventa estados para otro año', async () => {
  const calls = [];
  http.defaults.adapter = async config => {
    calls.push(config.params.anio_escolar_id);
    if (config.params.anio_escolar_id === '2') throw new Error('Sin acceso');
    return response(config, [item('1')]);
  };
  const result = await load([section('1'), { ...section('2'), anio_escolar_id: '2' }], [year, { ...year, id: '2' }], date, () => true);
  assert.deepEqual(calls, ['1', '2']); assert.equal(result['1'].status, 'ready'); assert.equal(result['2'].status, 'error');
});

test('presentación usa valores recibidos y distingue sin registro, no lectivo, error y fuera de año', () => {
  const render = summary => renderToStaticMarkup(h(Summary, { date, summary }));
  const html = render({ status: 'ready', item: item('1') });
  assert.match(html, /16\/11\/2026/); assert.equal((html.match(/<dd/g) ?? []).length, 5);
  for (const status of ['error', 'outside-year', 'loading']) assert.doesNotMatch(render({ status }), /<dd/);
  const empty = render({ status: 'ready', item: item('1', { es_lectivo: false, situacion: 'SIN_REGISTRO', sesion_id: null, resumen: null }) });
  assert.match(empty, /Fecha no lectiva/); assert.match(empty, /Asistencia aún no registrada/); assert.doesNotMatch(empty, /<dd/);
});

test('buscador local conserva orden, acepta código/tildes y muestra contador global aun sin resultados', () => {
  const base = structuredClone(data); base.padron[2].estudiante.codigo_estudiante = 'SEC-009';
  for (const query of ['perez 2', 'MARÍA 2', 'sec-009']) {
    const html = renderToStaticMarkup(h(View, { data: base, query, pendingCount: 3 }));
    assert.match(html, /Mostrando 1 de 4 estudiantes · 3 cambios sin guardar/);
    assert.equal((html.match(/<li /g) ?? []).length, 1);
    assert.match(html, /Pérez 2/);
  }
  const html = renderToStaticMarkup(h(View, { data: base, query: 'no existe', pendingCount: 3, editable: true }));
  assert.match(html, /Mostrando 0 de 4 estudiantes · 3 cambios sin guardar/);
  assert.match(html, /toda la sección, incluidos los ocultos/); assert.doesNotMatch(html, /Resumen de asistencia/);
});
