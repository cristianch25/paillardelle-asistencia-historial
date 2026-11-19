import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { data } from './support/attendanceFixture.mjs';

let vite, View, Bar, patch, reducer, create, assertSaved;
const id = data.padron[3].asistencia_id;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  const load = name => vite.ssrLoadModule(`/src/features/asistencias/${name}`);
  View = (await load('AsistenciaSessionView.tsx')).default;
  Bar = (await load('AttendanceSaveBar.tsx')).default;
  ({ attendancePatch: patch, assertAttendanceSaved: assertSaved } = await load('attendanceReconciliation.ts'));
  ({ attendanceEditorReducer: reducer, createAttendanceEditor: create } = await load('attendanceEditorState.ts'));
});
after(async () => { await vite?.close(); });
const justify = (editor, reason = 'Atención médica', target = id) => reducer(editor, { type: 'justify', id: target, reason });
const refresh = (editor, current) => reducer(editor, { type: 'refreshed', epoch: editor.epoch, data: current, message: 'Consultada' });

test('primera marca y justificación usan un cambio con versiones de sesión/fila independientes', () => {
  const target = data.padron[0].asistencia_id;
  let editor = reducer(create('5', data), { type: 'select', id: target, state: 'FALTA' });
  editor = justify(editor, 'Aviso', target);
  assert.deepEqual(patch(editor.base, editor.changes, editor.reasons), { version: 7, cambios: [{
    asistencia_id: target, version: 0, estado: 'FALTA', justificada: true, motivo_justificacion: 'Aviso',
  }] });
});

test('justificación posterior de FALTA/TARDANZA conserva estado; marca ordinaria omite metadatos', () => {
  for (const row of data.padron.slice(2)) {
    const body = patch(data, { [data.padron[0].asistencia_id]: 'PRESENTE' }, { [row.asistencia_id]: ' Cita ' });
    assert.equal(body.cambios.length, 2);
    assert.deepEqual(body.cambios[1], { asistencia_id: row.asistencia_id, version: row.version,
      estado: row.estado, justificada: true, motivo_justificacion: 'Cita' });
    assert.equal(body.cambios[0].justificada, undefined);
  }
});

test('validación rechaza vacío, espacios, 501 caracteres y Unicode inválido; admite 500 caracteres Unicode', () => {
  for (const reason of ['', '  ', 'x'.repeat(501), '\uD800']) assert.throws(() => patch(data, {}, { [id]: reason }));
  assert.equal(patch(data, {}, { [id]: '😀'.repeat(500) }).cambios.length, 1);
  assert.throws(() => patch(data, {}, { [data.padron[0].asistencia_id]: 'Aviso' }));
});

test('sesion cerrada permite marca y justificacion sin motivo ordinario', () => {
  const closed = structuredClone(data); closed.sesion.estado = 'CERRADA';
  const editor = justify(create('5', closed));
  const body = patch(closed, editor.changes, editor.reasons);
  assert.equal(body.cambios[0].motivo, undefined);
  assert.equal(body.cambios[0].motivo_justificacion, 'Atención médica');
  assert.equal(patch(closed, { [id]: 'TARDANZA' }, editor.reasons).cambios[0].motivo, undefined);
});

test('persistida no permite cambiar estado, modificar motivo o retirar; mismos valores son no-op', () => {
  const persisted = structuredClone(data); Object.assign(persisted.padron[3], { justificada: true, motivo_justificacion: 'Aviso' });
  const editor = create('5', persisted);
  assert.equal(justify(editor, 'Otro'), editor); assert.equal(justify(editor, undefined), editor);
  assert.deepEqual(reducer(editor, { type: 'select', id, state: 'TARDANZA' }).changes, {});
  assert.deepEqual(patch(persisted, {}, { [id]: 'Aviso' }).cambios, []);
  assert.deepEqual(patch(persisted, {}).cambios, []);
  assert.throws(() => patch(persisted, {}, { [id]: 'Otro' }));
});

test('confirmación limpia motivos; una respuesta sin persistirlos nunca confirma éxito', () => {
  const editor = justify(create('5', data)), current = structuredClone(data);
  current.sesion.version++;
  Object.assign(current.padron[3], { justificada: true, motivo_justificacion: 'Atención médica', version: 4 });
  const body = patch(data, {}, editor.reasons);
  assertSaved(data, current, body);
  const saved = reducer(editor, { type: 'saved', epoch: editor.epoch, data: current, message: 'OK' });
  assert.deepEqual(saved.reasons, {}); assert.equal(saved.success, true);
  current.padron[3].justificada = false; assert.throws(() => assertSaved(data, current, body));
});

test('409 conserva motivo y exige decisión; versión actualizada se usa solo después de resolver', () => {
  let editor = justify(create('5', data)); const current = structuredClone(data);
  current.sesion.version++; current.padron[3].version++;
  editor = refresh(editor, current);
  assert.deepEqual(editor.conflicts, [id]); assert.equal(editor.reasons[id], 'Atención médica');
  assert.equal(editor.success, false);
  editor = reducer(editor, { type: 'resolve', id, local: true });
  assert.deepEqual(editor.conflicts, []); assert.equal(patch(editor.base, editor.changes, editor.reasons).cambios[0].version, 4);
});

test('justificación distinta de otro actor bloquea sobrescritura; igualdad tras incertidumbre elimina pendiente sin éxito', () => {
  const editor = justify(create('5', data)), current = structuredClone(data);
  Object.assign(current.padron[3], { justificada: true, motivo_justificacion: 'Otro motivo', version: 4 });
  const conflict = refresh(editor, current);
  assert.equal(reducer(conflict, { type: 'resolve', id, local: true }), conflict);
  assert.deepEqual(reducer(conflict, { type: 'resolve', id, local: false }).reasons, {});
  current.padron[3].motivo_justificacion = 'Atención médica';
  const equal = refresh(editor, current);
  assert.deepEqual(equal.reasons, {}); assert.deepEqual(equal.conflicts, []); assert.equal(equal.success, false);
});

test('rechazo conserva motivo; descarte confirmado, pérdida de acceso y cambio de cuenta lo invalidan', () => {
  const editor = justify(create('5', data));
  assert.equal(reducer(editor, { type: 'phase', epoch: editor.epoch, phase: 'idle', message: 'Rechazo' }).reasons[id], 'Atención médica');
  for (const action of [{ type: 'discard', epoch: editor.epoch }, { type: 'phase', epoch: editor.epoch, phase: 'denied', message: '' },
    { type: 'reset', accountId: '6', source: data }]) assert.deepEqual(reducer(editor, action).reasons, {});
});

test('vista: cuatro estados, casilla después de botones, validación y persistida de solo lectura', () => {
  const props = { data, editable: true, onJustify() {}, pendingCount: 1, reasons: { [id]: '' } };
  const html = renderToStaticMarkup(h(View, props));
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 16);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.match(html, /1 cambio sin guardar/); assert.match(html, /Escribe un motivo válido/);
  assert.doesNotMatch(html, /<dialog|<form|Aplicar|Cancelar|canal|observación/i);
  const persisted = structuredClone(data); Object.assign(persisted.padron[3], { justificada: true, motivo_justificacion: 'Aviso' });
  const readonly = renderToStaticMarkup(h(View, { ...props, data: persisted, reasons: {} }));
  assert.match(readonly, /readOnly=""/); assert.match(readonly, /Estado y motivo de solo lectura/);
  assert.doesNotMatch(renderToStaticMarkup(h(Bar, { count: 1, phase: 'idle', message: '', success: false,
    disabled: false, conflicts: 0, onSave() {}, onRefresh() {} })), /disabled=""|no está disponible/);
});
