import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { data, selection } from './support/attendanceFixture.mjs';

let vite, Summary, View;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  Summary = (await vite.ssrLoadModule('/src/features/asistencias/SectionAttendanceSummary.tsx')).default;
  View = (await vite.ssrLoadModule('/src/features/asistencias/AsistenciaSessionView.tsx')).default;
});
after(async () => { await vite?.close(); });
const date = '2026-11-16';
const section = id => ({ ...selection.section, id });
const item = (id, changes = {}) => ({ seccion: section(id), es_lectivo: true, situacion: 'ABIERTA',
  sesion_id: `100${id}`, resumen: structuredClone(data.resumen), ...changes });
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

test('tarjeta compacta conserva los cuatro conteos recibidos sin fecha ni lectividad', () => {
  const summary = { status: 'ready', item: item('1', { es_lectivo: false }) };
  const html = renderToStaticMarkup(h(Summary, { date, summary, compact: true }));
  assert.equal((html.match(/<dd/g) ?? []).length, 4);
  for (const label of ['Presentes', 'Tardanzas', 'Faltas', 'Sin marcar']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Asistencia del|Fecha no lectiva|Total de estudiantes/);
  assert.deepEqual(summary.item.resumen, data.resumen);
});
