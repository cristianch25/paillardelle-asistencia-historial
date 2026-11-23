import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { studentProfileResponse } from './support/studentProfileFixture.mjs';
let vite, View, api, http, History, Profile;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  View = (await vite.ssrLoadModule('/src/features/estudiantes/perfil/StudentProfileView.tsx')).default;
  api = await vite.ssrLoadModule('/src/features/estudiantes/perfil/profile.api.ts');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  History = (await vite.ssrLoadModule('/src/features/estudiantes/perfil/StudentDailyHistory.tsx')).default;
  Profile = (await vite.ssrLoadModule('/src/features/estudiantes/perfil/StudentProfile.tsx')).default;
});

test('perfil completo sin filtros; historial separado conserva sus selectores', () => {
  const html = renderToStaticMarkup(h(Profile, { selection: { studentId: '1' } }));
  assert.doesNotMatch(html, /<select|type="month"|Mes del perfil|Actualizar perfil/);
  const historical = renderToStaticMarkup(h(Profile, { selection: { studentId: '1' }, historyOnly: true }));
  assert.match(historical, /<select/); assert.match(historical, /Mes del historial/);
});

const history = data => renderToStaticMarkup(h(History, { days: data.dias, today: '2026-11-21', formatSection: section => section.letra }));
const rowDates = html => [...html.matchAll(/<th scope="row"[^>]*>([^<]+)<\/th>/g)].map(match => match[1]);
test('mes actual: hoy primero, orden descendente y futuro desplegable sin alterar estados ni resumen', () => {
  const data = studentProfileResponse(), original = structuredClone(data), html = history(data);
  const [elapsed, future] = html.split('<details');
  assert.equal(rowDates(elapsed)[0], '21/11/2026');
  assert.equal(rowDates(elapsed).at(-1), '01/11/2026');
  assert.equal(rowDates(elapsed).length, 21);
  assert.equal(rowDates(future)[0], '30/11/2026'); assert.equal(rowDates(future).length, 9);
  assert.match(future, /Fechas posteriores a hoy/);
  assert.doesNotMatch(future, /Pendiente/);
  for (const state of ['Presente', 'Tardanza', 'Falta', 'Pendiente', 'Sin sesión', 'Sin marca individual', 'Fuera de vigencia', 'Aviso vigente']) assert.ok(html.includes(state));
  assert.deepEqual(data, original);
});

test('mes anterior completo comienza por el último día; la columna Sección depende de los IDs reales del mes', () => {
  const data = studentProfileResponse('1', '1', '2026-10');
  const html = history(data);
  assert.equal(rowDates(html)[0], '31/10/2026'); assert.equal(rowDates(html).length, 31);
  assert.doesNotMatch(html, /<details|>Sección<\/th>/);
  data.dias[10].seccion = { ...data.dias[10].seccion, id: '3', letra: 'OTRA SECCIÓN' };
  const moved = history(data);
  assert.match(moved, />Sección<\/th>/); assert.match(moved, /OTRA SECCIÓN/);
  assert.equal(rowDates(moved).length, 31);
});
after(async () => { await vite?.close(); });
test('perfil: historial de solo consulta y celular editable sin controles de corrección de asistencia', () => {
  const html = renderToStaticMarkup(h(View, { data: studentProfileResponse() }));
  for (const text of ['00001', 'Apoderada actual', '900000001', 'Pendiente', 'Sin sesión', 'Sin marca individual',
    'Día no lectivo', 'Fuera de vigencia', 'Aviso vigente']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /<input|Corregir|Guardar|version|usuario_id/);
  assert.match(html, /<strong>Apoderada actual<\/strong>/);
  assert.equal([...html.matchAll(/<dt\b/g)].length, 4);
  assert.doesNotMatch(html, /Sección actual|Secciones del período|Incidencias justificadas|Faltas justificadas|Tardanzas justificadas|Vínculo activo|apoderado histórico/);
});
test('sin asistencias: conserva los cuatro indicadores y el historial sin mensajes redundantes', () => {
  const data = studentProfileResponse();
  for (const key of Object.keys(data.resumen)) data.resumen[key] = 0;
  for (const day of data.dias) Object.assign(day, { estado: null, justificada: false, motivo_justificacion: null, situacion: 'SIN_SESION' });
  const html = renderToStaticMarkup(h(View, { data }));
  assert.equal([...html.matchAll(/<dd\b[^>]*>0<\/dd>/g)].length, 4);
  assert.match(html, /Historial diario|Sin sesión/);
  assert.doesNotMatch(html, /No hay marcas individuales|Incidencias justificadas/);
});
test('apoderado no autorizado se diferencia de vínculo inexistente sin exponer teléfono', () => {
  const data = studentProfileResponse(); data.apoderado_visible = false; data.apoderado = null;
  assert.match(renderToStaticMarkup(h(View, { data })), /Sin permiso para consultar/);
  data.apoderado_visible = true;
  assert.match(renderToStaticMarkup(h(View, { data })), /Sin apoderado vinculado/);
});
test('vista compacta: solo nombre, sección y contacto; sin filtros, historial ni guardado ficticio', () => {
  const html = renderToStaticMarkup(h(View, { data: studentProfileResponse(), compact: true }));
  assert.match(html, /Ana María/); assert.match(html, /CREATIVOS/); assert.match(html, /Apoderada actual/); assert.match(html, /900000001/);
  assert.match(html, /Editar celular/); assert.doesNotMatch(html, /pendiente de habilitación/);
  assert.doesNotMatch(html, /<table|<input|<select|Resumen mensual|Historial diario|Secciones del período|Código:|Guardar número|Aviso vigente/);
});
test('API usa un GET acotado al estudiante y mes; rechaza identidad, resumen o ausencias inconsistentes', async () => {
  const calls = [];
  http.defaults.adapter = async config => { calls.push(config); return { config, data: studentProfileResponse(), status: 200 }; };
  assert.equal((await api.getStudentProfile('1', '1', '2026-11')).dias.length, 30);
  assert.deepEqual(calls[0].params, { anio_escolar_id: '1', mes: '2026-11' }); assert.equal(calls[0].url, '/estudiantes/1/perfil');
  await assert.rejects(api.getStudentProfile('1', '1', '2026-13')); assert.equal(calls.length, 1);
  for (const mutate of [d => { d.estudiante.id = '2'; }, d => { d.contexto.mes = '2026-12'; },
    d => { d.dias[0].estado = 'FALTA'; }, d => { d.apoderado_visible = false; }, d => { d.resumen.faltas++; },
    d => { d.resumen.presentes = 0; d.resumen.faltas = 2; }]) {
    http.defaults.adapter = async config => { const data = studentProfileResponse(); mutate(data); return { config, data, status: 200 }; };
    await assert.rejects(api.getStudentProfile('1', '1', '2026-11'));
  }
});
