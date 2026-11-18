import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { monthlyFollowupResponse } from './support/monthlyFollowupFixture.mjs';
import { statisticsYear as year } from './support/statisticsFixture.mjs';

let vite, api, http, View;
const query = { anio_escolar_id: year.id, mes: '2026-11', page: 1, limit: 20 };
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/estadisticas/monthlyFollowup.api.ts');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  View = (await vite.ssrLoadModule('/src/features/estadisticas/MonthlyFollowup.tsx')).default;
});
after(async () => { await vite?.close(); });
test('consulta agregada paginada usa un GET, mes explícito y conserva IDs grandes y secciones', async () => {
  const calls = [];
  http.defaults.adapter = async config => { calls.push(config); return { config, data: monthlyFollowupResponse(config.params), status: 200, headers: {} }; };
  const data = await api.getMonthlyFollowup(query);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/asistencias/seguimiento-mensual');
  assert.deepEqual(calls[0].params, query); assert.equal(data.estudiantes[0].estudiante.id, '9007199254740993');
  assert.equal(data.estudiantes.length, 20); assert.equal(data.pagination.total, 21); assert.equal(data.estudiantes[0].secciones.length, 2);
  const last = await api.getMonthlyFollowup({ ...query, page: 2 }); assert.equal(last.estudiantes.length, 1);
});
test('rechaza datos de otro mes/ámbito/página, duplicados, conteos incompatibles y secciones ajenas', async () => {
  for (const mutate of [d => { d.filtros.mes = '2026-10'; }, d => { d.pagination.page = 2; }, d => { d.pagination.total = 2; },
    d => { d.estudiantes[0].total = 2; }, d => { d.estudiantes[0].justificadas++; }, d => { d.estudiantes[0].estudiante.id = 123; },
    d => { d.estudiantes[1].estudiante.id = d.estudiantes[0].estudiante.id; }, d => { d.estudiantes[0].secciones = []; },
    d => { d.niveles_autorizados = ['PRIMARIA']; }, d => { d.estudiantes[0].secciones[0].nivel = 'OTRO'; }]) {
    http.defaults.adapter = async config => { const data = monthlyFollowupResponse(query); mutate(data); return { config, data, status: 200 }; };
    await assert.rejects(api.getMonthlyFollowup(query));
  }
});
function render(state) {
  return renderToStaticMarkup(h(View, { year, state: { month: query.mes, range: { fecha_desde: '2026-11-01', fecha_hasta: '2026-11-30', error: '' },
    loading: false, error: '', data: null, setMonth() {}, refresh() {}, setPage() {}, ...state } }));
}
test('tabla compacta: estudiante único con secciones, desglose de incidencias, total y sin acciones de historial', () => {
  const html = render({ data: monthlyFollowupResponse(query, 1) }), text = html.replace(/<[^>]*>/g, '');
  assert.match(text, /Prueba Estudiante 1/); assert.match(text, /4 años · A/); assert.match(text, /4 años · B/);
  assert.match(text, /JustificadasInjustificadas/); assert.match(text, /desde la tercera incidencia, sin esperar cierres/);
  assert.match(text, /no implica sanciones/); assert.doesNotMatch(html, /<a |historial técnico|motivo_justificacion/);
});
test('carga, vacío, error y página vacía tras correcciones se distinguen sin filas antiguas', () => {
  assert.match(render({ loading: true }), /Consultando seguimiento mensual/);
  assert.match(render({ error: 'Sin permiso' }), /Reintentar seguimiento/);
  assert.match(render({ data: monthlyFollowupResponse(query, 0) }), /No hay estudiantes con 3 o más incidencias/);
  const beyond = monthlyFollowupResponse({ ...query, page: 2 }, 1);
  assert.match(render({ data: beyond }), /Esta página ya no tiene resultados/);
});
