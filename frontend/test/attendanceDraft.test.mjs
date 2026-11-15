import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { data } from './support/attendanceFixture.mjs';

let vite, draft, View, http;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  draft = await vite.ssrLoadModule('/src/features/asistencias/attendanceDraft.ts');
  View = (await vite.ssrLoadModule('/src/features/asistencias/AsistenciaSessionView.tsx')).default;
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });

test('selección individual admite los cuatro estados sin alterar identificadores, versiones ni la base', () => {
  const original = structuredClone(data), id = data.padron[0].asistencia_id;
  let changes = {};
  for (const state of ['PRESENTE', 'TARDANZA', 'FALTA', 'PENDIENTE']) {
    changes = draft.selectAttendanceState(data.padron, changes, id, state);
    assert.equal(changes[id] ?? data.padron[0].estado, state);
    assert.equal(Object.keys(changes).length, state === 'PENDIENTE' ? 0 : 1);
  }
  assert.deepEqual(data, original);
});

test('cambios repetidos y reversión cuentan estudiantes distintos, no clics', () => {
  const [pending, present] = data.padron;
  let changes = draft.selectAttendanceState(data.padron, {}, pending.asistencia_id, 'FALTA');
  changes = draft.selectAttendanceState(data.padron, changes, pending.asistencia_id, 'TARDANZA');
  changes = draft.selectAttendanceState(data.padron, changes, present.asistencia_id, 'PENDIENTE');
  assert.equal(Object.keys(changes).length, 2);
  changes = draft.selectAttendanceState(data.padron, changes, present.asistencia_id, 'PRESENTE');
  assert.equal(Object.keys(changes).length, 1);
  assert.equal(draft.selectAttendanceState(data.padron, changes, '999', 'FALTA'), changes);
});

test('marcado masivo afecta únicamente pendientes del borrador y conserva faltas/tardanzas', () => {
  const original = structuredClone(data);
  const changes = draft.markPendingPresent(data.padron, {});
  assert.deepEqual(changes, { [data.padron[0].asistencia_id]: 'PRESENTE' });
  assert.deepEqual(draft.draftSummary(data.padron, changes),
    { total: 4, presentes: 2, tardanzas: 1, faltas: 1, pendientes: 0 });
  assert.deepEqual(draft.markPendingPresent(data.padron, changes), changes);
  assert.deepEqual(data, original);
});

test('masivo respeta selecciones locales y elimina diferencias que vuelven al PRESENTE confirmado', () => {
  const [pending, present, late] = data.padron;
  const changes = { [pending.asistencia_id]: 'FALTA', [present.asistencia_id]: 'PENDIENTE', [late.asistencia_id]: 'PENDIENTE' };
  const next = draft.markPendingPresent(data.padron, changes);
  assert.deepEqual(next, { [pending.asistencia_id]: 'FALTA', [late.asistencia_id]: 'PRESENTE' });
  assert.equal(changes[present.asistencia_id], 'PENDIENTE');
});

test('la identidad incluye cuenta, año, sección, fecha y sesión; ignora referencias y versiones', () => {
  const key = draft.attendanceDraftKey('5', data);
  assert.equal(draft.attendanceDraftKey('5', structuredClone(data)), key);
  assert.equal(draft.attendanceDraftKey('5', { ...data, sesion: { ...data.sesion, version: 8 } }), key);
  assert.notEqual(draft.attendanceDraftKey('6', data), key);
  for (const field of ['id', 'anio_escolar_id', 'seccion_id', 'fecha']) {
    assert.notEqual(draft.attendanceDraftKey('5', { ...data, sesion: { ...data.sesion, [field]: 'otro' } }), key);
  }
  assert.equal(draft.attendanceDraftKey(null, data), null);
  assert.equal(draft.attendanceDraftKey('5', null), null);
});

test('vista editable mantiene nombres y orden, cuatro controles táctiles y selección explícita', () => {
  const html = renderToStaticMarkup(h(View, { data, editable: true }));
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 16);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 4);
  assert.match(html, /Pérez 0 Del Río Ana María/);
  assert.ok(html.indexOf('Pérez 0') < html.indexOf('Pérez 3'));
  assert.match(html, /min-h-11/);
  assert.match(html, /Las marcas se guardan solo al pulsar/);
  assert.doesNotMatch(html, /Cerrar asistencia|Justificar|900719925474099/);
});

test('resumen identifica cambios locales y masivo se deshabilita cuando no quedan pendientes', () => {
  const changes = draft.markPendingPresent(data.padron, {});
  const html = renderToStaticMarkup(h(View, { data, editable: true, changes }));
  assert.match(html, /1 estudiante sin guardar/);
  assert.match(html, /El resumen incluye cambios sin guardar/);
  assert.match(html, /disabled=""[^>]*>Marcar todos como presentes/);
  assert.match(html, /No hay estudiantes sin marcar/);
});

test('sesión CERRADA no presenta controles ni aplica borrador aunque se solicite edición', () => {
  const html = renderToStaticMarkup(h(View, { data: { ...data, sesion: { ...data.sesion, estado: 'CERRADA' } },
    editable: true, changes: { [data.padron[0].asistencia_id]: 'PRESENTE' } }));
  assert.match(html, /Sesión cerrada · Solo consulta/);
  assert.doesNotMatch(html, /<button|aria-pressed|Sin guardar|Marcado provisional/);
});

test('editar y renderizar no inicia solicitudes HTTP ni PATCH', () => {
  let calls = 0;
  http.defaults.adapter = async () => { calls++; throw new Error('No debe solicitar HTTP'); };
  const changes = draft.markPendingPresent(data.padron,
    draft.selectAttendanceState(data.padron, {}, data.padron[1].asistencia_id, 'TARDANZA'));
  renderToStaticMarkup(h(View, { data, editable: true, changes }));
  assert.equal(calls, 0);
});
