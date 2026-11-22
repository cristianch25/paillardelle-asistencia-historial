import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { dailyRows, dailyYear } from './support/adminHomeFixture.mjs';

let vite, summary, api, http, View, Home, Auth, dates, access;
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
  access = await vite.ssrLoadModule('/src/features/asistencias/supervision/supervisionAccess.ts');
});
after(async () => { await vite?.close(); });

test('ABIERTA/CERRADA reales suman estados; SIN_REGISTRO permanece separado de pendientes', () => {
  const result = summary.summarizeDay(dailyRows(), dailyYear.id);
  assert.deepEqual(result.counts, { total: 18, presentes: 9, tardanzas: 3, faltas: 3, pendientes: 3 });
  assert.equal(result.registered, 2); assert.equal(result.unregistered, 1);
  assert.equal(result.levels[0].counts.total, 10); assert.equal(result.levels[1].counts.total, 8);
  assert.equal(result.levels[2].counts, null); assert.equal(result.levels[2].lective, false);
  assert.match(renderToStaticMarkup(h(View, { data: result })), /No corresponde registrar asistencia en Secundaria/);
});

test('ADMIN mantiene cuatro tarjetas, sin bloque por nivel ni contadores de salones', () => {
  const result = summary.summarizeDay(dailyRows(230), dailyYear.id);
  const html = renderToStaticMarkup(h(View, { data: result })), text = html.replace(/<[^>]*>/g, '');
  assert.match(text, /Presentes9Tardanzas3Faltas3Pendientes3/);
  assert.doesNotMatch(text, /Asistencia registrada por nivel|Salones con|Salones sin|Total institucional/);
  assert.match(text, /No corresponde registrar asistencia en Secundaria/);
  assert.doesNotMatch(text, /SIN_REGISTRO|sesiones|Con sesión|Total de estudiantes/);
});

test('futuro/no lectivo/sin secciones no inventan faltas ni totales de asistencia', () => {
  for (const date of ['2026-12-31', '2026-11-14']) {
    const result = summary.summarizeDay(dailyRows(3, date), dailyYear.id);
    assert.equal(result.counts, null); assert.equal(result.registered, 0); assert.equal(result.unregistered, 3);
    const html = renderToStaticMarkup(h(View, { data: result }));
    assert.equal((html.match(/Sin datos/g) ?? []).length, 4);
    assert.doesNotMatch(html, /Salones sin asistencia registrada|0\/3/);
    if (date === '2026-11-14') {
      assert.match(html, /Fecha no lectiva. No corresponde registrar asistencia/);
      assert.doesNotMatch(html, /No hay asistencia registrada/);
    }
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

test('Inicio de REGISTRADOR resume el día; otros roles conservados y fecha inicial de Lima', () => {
  for (const rol of ['REGISTRADOR', 'SUPERUSUARIO']) {
    const html = renderToStaticMarkup(h(MemoryRouter, null, h(Auth.Provider, { value: { session: { user: { rol, nombres: 'Rosa', apellidos: 'Prueba', usuario: 'rosa', nivel_asignado: 'PRIMARIA' } } } }, h(Home))));
    assert.doesNotMatch(html, /Resumen diario institucional/);
    if (rol === 'REGISTRADOR') {
      assert.match(html, /Ir a mis secciones/); assert.doesNotMatch(html, /Tu cuenta|Rosa|espacio de trabajo|Nombre completo|Usuario/);
      assert.match(html, /Registro de asistencia de hoy/); assert.match(html, /Estudiantes en seguimiento/);
    } else { assert.match(html, /Bienvenido\/a/); assert.match(html, /Tu cuenta|Nombre completo|Usuario/); }
    assert.doesNotMatch(html, /Identificación|Nivel principal:|Fecha consultada|America\/Lima/);
  }
  assert.equal(dates.peruToday(new Date('2026-11-18T04:59:59Z')), '2026-11-17');
});

test('SUBDIRECCION reutiliza el resumen con la matriz RN-06, sin ampliarla por adicionales', () => {
  for (const [principal, expected] of [['INICIAL', ['INICIAL']], ['PRIMARIA', ['INICIAL', 'PRIMARIA']], ['SECUNDARIA', ['SECUNDARIA']]]) {
    const levels = access.supervisionLevels({ rol: 'SUBDIRECCION', nivel_asignado: principal,
      niveles_adicionales: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'] });
    assert.deepEqual(levels, expected);
    const data = summary.summarizeDay(dailyRows(230).filter(row => levels.includes(row.seccion.nivel)), dailyYear.id);
    const html = renderToStaticMarkup(h(View, { data, levels }));
    assert.equal((html.match(/aria-label="Resumen de /g) ?? []).length, levels.length);
    assert.doesNotMatch(html, /Conteos de asistencia|Salones sin asistencia registrada/);
    assert.match(html, /registradas|secciones autorizadas/);
    const noLective = summary.summarizeDay(dailyRows(230, '2026-11-14').filter(row => levels.includes(row.seccion.nivel)), dailyYear.id);
    const nonLectiveHtml = renderToStaticMarkup(h(View, { data: noLective, levels }));
    assert.match(nonLectiveHtml, /No corresponde registrar asistencia/);
    assert.doesNotMatch(nonLectiveHtml, /0\/|Total autorizado|No hay asistencia registrada/);
    assert.equal((nonLectiveHtml.match(/Fecha no lectiva/g) ?? []).length, 1);
    assert.doesNotMatch(nonLectiveHtml, /secciones registradas|puede tener estudiantes pendientes/);
  }
});

test('distintivo informativo muestra 2/3 reales, sin convertir el registro en marcas completas', () => {
  const rows = dailyRows();
  for (const row of rows) { row.seccion.nivel = 'PRIMARIA'; row.es_lectivo = true; }
  const data = summary.summarizeDay(rows, dailyYear.id);
  const html = renderToStaticMarkup(h(View, { data, levels: ['INICIAL', 'PRIMARIA'] }));
  assert.equal(data.registered, 2); assert.equal(data.sections, 3); assert.equal(data.counts.pendientes, 3);
  assert.match(html, /aria-label="2 de 3 secciones registradas"/);
  assert.match(html.replace(/<[^>]*>/g, ''), /2\/3registradas/);
  assert.doesNotMatch(html, /Una sección con registro puede tener estudiantes pendientes|Total autorizado/);
  assert.doesNotMatch(html, /<button|Un salón cuenta como registrado/);
});

test('respuesta con niveles fuera del alcance no publica conteos ni información de otros niveles', () => {
  const html = renderToStaticMarkup(h(View, { data: summary.summarizeDay(dailyRows(), dailyYear.id), levels: ['INICIAL'] }));
  assert.match(html, /role="alert"/);
  assert.match(html, /fuera del ámbito/);
  assert.doesNotMatch(html, /Conteos de asistencia|Resumen de Primaria|Resumen de Secundaria|secciones con registro/);
});
