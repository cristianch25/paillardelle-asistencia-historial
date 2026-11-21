import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { statisticsYear as year, statisticsFilters as filters, statisticsResponse } from './support/statisticsFixture.mjs';

let vite, periods, api, http, Charts, Page, Auth, navigation;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  periods = await vite.ssrLoadModule('/src/features/estadisticas/statisticsPeriod.ts');
  api = await vite.ssrLoadModule('/src/features/estadisticas/statistics.api.ts');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  Charts = (await vite.ssrLoadModule('/src/features/estadisticas/StatisticsCharts.tsx')).default;
  Page = (await vite.ssrLoadModule('/src/features/estadisticas/StatisticsPage.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
});
after(async () => { await vite?.close(); });

test('rangos civiles: día, semana lunes-domingo y mes, incluidos bisiestos y límites del año', () => {
  assert.deepEqual(periods.statisticsRange('dia', '2026-11-17', year), { fecha_desde: '2026-11-17', fecha_hasta: '2026-11-17', error: '' });
  for (const reference of ['2026-11-16', '2026-11-17', '2026-11-22']) {
    assert.deepEqual(periods.statisticsRange('semana', reference, year), { fecha_desde: '2026-11-16', fecha_hasta: '2026-11-22', error: '' });
  }
  assert.deepEqual(periods.statisticsRange('semana', '2026-12-18', year), { fecha_desde: '2026-12-14', fecha_hasta: '2026-12-18', error: '' });
  assert.deepEqual(periods.statisticsRange('mes', '2026-03-01', year), { fecha_desde: '2026-03-02', fecha_hasta: '2026-03-31', error: '' });
  assert.deepEqual(periods.statisticsRange('mes', '2026-12-01', year), { fecha_desde: '2026-12-01', fecha_hasta: '2026-12-18', error: '' });
  const leap = { ...year, fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' };
  assert.equal(periods.statisticsRange('mes', '2024-02-20', leap).fecha_hasta, '2024-02-29');
  for (const reference of ['', '2026-02-29', '2027-01-01']) assert.ok(periods.statisticsRange('dia', reference, year).error);
  assert.ok(periods.statisticsRange('dia', '2026-11-17').error);
  assert.equal(periods.initialStatisticsDate('2027-01-01', year), year.fecha_fin);
  assert.equal(periods.initialStatisticsDate('2025-01-01', year), year.fecha_inicio);
});
test('gráficos: cantidades reales, pendientes separados y porcentajes sobre marcas, sin sumar pendientes', () => {
  const html = renderToStaticMarkup(h(Charts, { data: statisticsResponse() })), text = html.replace(/<[^>]*>/g, '');
  assert.equal((html.match(/role="img"/g) ?? []).length, 2);
  assert.match(text, /Presentes: 6 \(60 %\)/); assert.match(text, /Tardanzas: 2 \(20 %\)/); assert.match(text, /Faltas: 2 \(20 %\)/);
  assert.match(text, /Pendientes7/);
  assert.doesNotMatch(text, /salones con registro diario|Cada salón cuenta|Porcentajes sobre presentes|registros diarios, no a estudiantes únicos/);
  assert.match(html, /width="240"/); assert.match(html, /stroke-dasharray="60 40"/);
  for (const color of ['#22C55E', '#F59E0B', '#F43F5E']) {
    assert.ok(html.includes(`fill="${color}"`)); assert.ok(html.includes(`stroke="${color}"`));
  }
  assert.match(html, /fill="#334155"/); assert.match(html, /fill="#0f172a"/);
});
test('personalizado: obligatorio, fechas reales y ordenadas dentro del año, sin límite mensual ni recorte', () => {
  for (const [start, end] of [['', ''], ['', '2026-11-30'], ['2026-11-01', ''],
    ['2026-02-29', '2026-11-30'], ['2026-11-01', '2026-11-31'], ['2026-11-30', '2026-11-01'],
    ['2026-03-01', '2026-11-30'], ['2026-11-01', '2026-12-19'],
    ['2025-11-01', '2025-11-30'], ['2027-11-01', '2027-11-30']]) {
    assert.ok(periods.statisticsRange('personalizado', start, year, end).error);
  }
  for (const [start, end] of [[year.fecha_inicio, year.fecha_fin], ['2026-11-17', '2026-11-17'], ['2026-03-20', '2026-09-15']]) {
    assert.deepEqual(periods.statisticsRange('personalizado', start, year, end), { fecha_desde: start, fecha_hasta: end, error: '' });
  }
});
test('solo pendientes: conserva cantidades y evita gráfico circular o porcentajes ficticios', () => {
  const data = statisticsResponse(); data.totales = { presentes: 0, tardanzas: 0, faltas: 0, pendientes: 7 }; data.marcas_registradas = 0;
  const html = renderToStaticMarkup(h(Charts, { data }));
  assert.match(html, /No hay marcas registradas para calcular porcentajes/);
  assert.doesNotMatch(html, /Gráfico circular|NaN|Infinity|\(0 %\)/);
  data.totales.presentes = 10; data.marcas_registradas = 10;
  const full = renderToStaticMarkup(h(Charts, { data })); assert.match(full, /stroke-dasharray="100 0"/);
});
test('API: una consulta agregada sin descargar estudiantes y respuesta ligada a los filtros', async () => {
  const calls = [];
  http.defaults.adapter = async config => { calls.push(config); return { config, data: statisticsResponse(config.params), status: 200, headers: {} }; };
  assert.equal((await api.getAttendanceStatistics(filters)).marcas_registradas, 10);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/asistencias/estadisticas'); assert.equal(calls[0].method, 'get');
  assert.deepEqual(calls[0].params, filters);
  for (const mutate of [d => d.marcas_registradas++, d => { d.totales.faltas = -1; }, d => { d.sesiones_con_registro = 0; },
    d => { d.filtros.fecha_desde = '2026-10-01'; }, d => { d.filtros.nivel = 'PRIMARIA'; },
    d => { d.niveles_autorizados = ['OTRO']; }, d => { d.niveles_autorizados = ['PRIMARIA', 'PRIMARIA']; }]) {
    http.defaults.adapter = async config => { const data = statisticsResponse(); mutate(data); return { config, data, status: 200 }; };
    await assert.rejects(api.getAttendanceStatistics(filters));
  }
});
test('acceso frontend: ADMIN/SUBDIRECCION comparten pantalla y menú, REGISTRADOR no los recibe', () => {
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    const html = renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { id: '1', rol } } } }, h(Page)));
    assert.equal(html.includes('Filtros de estadísticas'), rol !== 'REGISTRADOR');
    assert.equal(navigation.navigationFor(rol).some(item => item.path === '/estadisticas'), rol !== 'REGISTRADOR');
  }
});
