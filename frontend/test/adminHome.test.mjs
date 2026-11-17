import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dailyRows, dailyYear } from './support/adminHomeFixture.mjs';

let vite, summary, api, http, View, Home, Auth, dates;
const date = '2026-11-17';
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  summary = await vite.ssrLoadModule('/src/features/inicio/dailySummary.ts');
  api = await vite.ssrLoadModule('/src/features/inicio/dailySummary.api.ts');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  View = (await vite.ssrLoadModule('/src/features/inicio/DailySummaryView.tsx')).default;
  Home = (await vite.ssrLoadModule('/src/features/inicio/HomePage.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  dates = await vite.ssrLoadModule('/src/shared/dates/civilDate.ts');
});
after(async () => { await vite?.close(); });

test('ABIERTA/CERRADA reales suman estados; SIN_REGISTRO permanece separado de pendientes', () => {
  const result = summary.summarizeDay(dailyRows(), dailyYear.id);
  assert.deepEqual(result.counts, { total: 18, presentes: 9, tardanzas: 3, faltas: 3, pendientes: 3 });
  assert.equal(result.registered, 2); assert.equal(result.unregistered, 1);
  assert.equal(result.levels[0].counts.total, 10); assert.equal(result.levels[1].counts.total, 8);
  assert.equal(result.levels[2].counts, null); assert.equal(result.levels[2].lective, false);
  assert.match(renderToStaticMarkup(h(View, { data: result })), /Fecha no lectiva/);
});

test('presentación compacta: cuatro tarjetas y salones registrados aunque tengan pendientes', () => {
  const result = summary.summarizeDay(dailyRows(230), dailyYear.id);
  const html = renderToStaticMarkup(h(View, { data: result })), text = html.replace(/<[^>]*>/g, '');
  assert.match(text, /Presentes9Tardanzas3Faltas3Pendientes3/);
  assert.match(text, /Asistencia registrada por nivelInicial:1\/77Primaria:1\/77Secundaria:Fecha no lectiva0\/76/);
  assert.match(text, /Salones con asistencia registrada: 2/);
  assert.match(text, /Salones sin asistencia registrada: 228/);
  assert.match(text, /Total institucional: 2\/230 salones$/);
  assert.match(text, /aunque tenga estudiantes pendientes/);
  assert.doesNotMatch(text, /SIN_REGISTRO|sesiones|Con sesión|Total de estudiantes/);
});

test('futuro/no lectivo/sin secciones no inventan faltas ni totales de asistencia', () => {
  for (const date of ['2026-12-31', '2026-11-14']) {
    const result = summary.summarizeDay(dailyRows(3, date), dailyYear.id);
    assert.equal(result.counts, null); assert.equal(result.registered, 0); assert.equal(result.unregistered, 3);
    const html = renderToStaticMarkup(h(View, { data: result }));
    assert.equal((html.match(/Sin datos/g) ?? []).length, 4);
    assert.match(html.replace(/<[^>]*>/g, ''), /Total institucional: 0\/3 salones/);
  }
  const empty = summary.summarizeDay([], dailyYear.id);
  assert.ok(empty.levels.every(level => level.counts === null && level.lective === null));
  const html = renderToStaticMarkup(h(View, { data: empty }));
  assert.match(html, /No hay salones/); assert.doesNotMatch(html, /0\/0|Total institucional:/);
  const zeros = dailyRows(1); zeros[0].resumen = { total: 0, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 0 };
  assert.equal(summary.summarizeDay(zeros, dailyYear.id).counts.faltas, 0);
});

test('duplicados, resúmenes faltantes, conteos inválidos y ámbitos incompatibles se rechazan', () => {
  for (const mutate of [rows => rows.push(structuredClone(rows[0])), rows => { rows[1].sesion_id = rows[0].sesion_id; },
    rows => { rows[0].resumen = null; }, rows => { rows[2].resumen = rows[0].resumen; },
    rows => { rows[0].resumen.faltas = -1; }, rows => { rows[0].resumen.total++; },
    rows => { rows[0].resumen.total = Number.MAX_SAFE_INTEGER + 1; }, rows => { rows[0].seccion.anio_escolar_id = '2'; },
    rows => { rows[0].seccion.nivel = 'OTRO'; }, rows => { rows[0].es_lectivo = null; },
    rows => { rows[3].es_lectivo = !rows[0].es_lectivo; }]) {
    const rows = dailyRows(4); mutate(rows); assert.throws(() => summary.summarizeDay(rows, dailyYear.id));
  }
});

test('230 secciones: recorre tres páginas, sin filtros restrictivos ni GET por sesión', async () => {
  const rows = dailyRows(230), calls = [];
  http.defaults.adapter = async config => {
    calls.push(config); const page = config.params.page;
    assert.equal(config.url, '/asistencias/sesiones'); assert.equal(config.method, 'get');
    assert.deepEqual(config.params, { anio_escolar_id: dailyYear.id, fecha: date, page, limit: 100 });
    return { config, data: { anio_escolar_id: dailyYear.id, fecha: date, secciones: rows.slice((page - 1) * 100, page * 100),
      pagination: { page, limit: 100, has_more: page < 3 } }, status: 200, headers: {} };
  };
  const result = await api.getDailySummary(dailyYear.id, date, () => true);
  assert.equal(calls.length, 3); assert.equal(result.sections, 230); assert.equal(result.unregistered, 228);
  assert.equal(result.counts.total, 18);
});

test('fallo intermedio, invalidación, paginación errónea y duplicados nunca publican totales parciales', async () => {
  for (const kind of ['error', 'scope', 'page', 'limit', 'duplicate', 'no-progress', 'endless']) {
    let calls = 0;
    http.defaults.adapter = async config => {
      calls++; const page = config.params.page;
      if (kind === 'error' && page === 2) throw new AxiosError('Privado', '', config, null, { status: 500 });
      const rows = dailyRows(1); rows[0].seccion.id = kind === 'duplicate' ? '1' : String(page);
      rows[0].situacion = 'SIN_REGISTRO'; rows[0].sesion_id = null; rows[0].resumen = null;
      return { config, status: 200, headers: {}, data: { anio_escolar_id: kind === 'scope' ? 'otro' : dailyYear.id, fecha: date,
        secciones: kind === 'no-progress' ? [] : rows,
        pagination: { page: kind === 'page' ? 2 : page, limit: kind === 'limit' ? 20 : 100,
          has_more: kind === 'endless' || page === 1 } } };
    };
    await assert.rejects(api.getDailySummary(dailyYear.id, date, () => true));
    assert.ok(calls <= 100);
  }
  let current = true, calls = 0;
  http.defaults.adapter = async config => { calls++; current = false; return { config, data: {}, status: 200 }; };
  assert.equal(await api.getDailySummary(dailyYear.id, date, () => current), null); assert.equal(calls, 1);
  await assert.rejects(api.getDailySummary(dailyYear.id, '2026-02-30', () => true)); assert.equal(calls, 1);
});

test('Inicio de SUBDIRECCION y REGISTRADOR se conserva; fecha inicial corresponde a Lima', () => {
  for (const rol of ['SUBDIRECCION', 'REGISTRADOR']) {
    const html = renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { rol, nombres: 'Rosa', apellidos: 'Prueba', usuario: 'rosa', nivel_asignado: 'PRIMARIA' } } } }, h(Home)));
    assert.match(html, /Tu cuenta/); assert.match(html, /Bienvenido\/a/); assert.doesNotMatch(html, /Resumen diario institucional/);
  }
  assert.equal(dates.peruToday(new Date('2026-11-18T04:59:59Z')), '2026-11-17');
});
