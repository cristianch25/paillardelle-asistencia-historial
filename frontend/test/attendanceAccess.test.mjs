import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { data } from './support/attendanceFixture.mjs';

let vite, reducer, createEditor, Dialog;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ attendanceEditorReducer: reducer, createAttendanceEditor: createEditor } =
    await vite.ssrLoadModule('/src/features/asistencias/attendanceEditorState.ts'));
  Dialog = (await vite.ssrLoadModule('/src/shared/navigation/UnsavedChangesDialog.tsx')).default;
});
after(async () => { await vite?.close(); });

test('revalidar conserva cambios compatibles y conflictos pendientes de decisión explícita', () => {
  let editor = createEditor('5', data);
  const id = data.padron[0].asistencia_id;
  editor = reducer(editor, { type: 'select', id, state: 'PRESENTE' });
  const current = structuredClone(data); current.padron[0].estado = 'TARDANZA'; current.padron[0].version++;
  for (let count = 0; count < 2; count++) {
    editor = reducer(editor, { type: 'refreshed', epoch: editor.epoch, data: current, message: '' });
    assert.equal(editor.changes[id], 'PRESENTE'); assert.deepEqual(editor.conflicts, [id]);
  }
  const matched = structuredClone(current); matched.padron[0].estado = 'PRESENTE'; matched.padron[0].version++;
  editor = reducer(editor, { type: 'refreshed', epoch: editor.epoch, data: matched, message: '' });
  assert.deepEqual(editor.changes, {}); assert.deepEqual(editor.conflicts, []);
});

test('cierre pendiente persiste ante incertidumbre y termina al reconciliar, rechazar o invalidar', () => {
  let editor = createEditor('5', data);
  for (const phase of ['closing', 'refreshing', 'refresh-required']) {
    editor = reducer(editor, { type: 'phase', epoch: editor.epoch, phase, message: '' });
    assert.equal(editor.closePending, true);
  }
  assert.equal(reducer(editor, { type: 'refreshed', epoch: editor.epoch, data, message: '' }).closePending, false);
  assert.equal(reducer(editor, { type: 'saved', epoch: editor.epoch, data, message: '' }).closePending, false);
  for (const phase of ['idle', 'denied']) {
    assert.equal(reducer(editor, { type: 'phase', epoch: editor.epoch, phase, message: '' }).closePending, false);
  }
  const fresh = reducer(editor, { type: 'reset', accountId: '6', source: data });
  assert.equal(fresh.closePending, false);
  assert.equal(reducer(fresh, { type: 'phase', epoch: editor.epoch, phase: 'closing', message: '' }), fresh);
});

for (const [dirty, closing] of [[true, false], [false, true], [true, true]]) {
  test(`diálogo distingue borrador=${dirty} y cierre pendiente=${closing}, con etiquetas accesibles`, () => {
    const html = renderToStaticMarkup(createElement(Dialog, { open: true, busy: true, dirty, closing,
      onCancel() {}, onConfirm() {} }));
    assert.match(html, /aria-labelledby="[^"]+" aria-describedby="[^"]+"/);
    if (dirty) assert.match(html, /Tienes cambios de asistencia pendientes/);
    else assert.doesNotMatch(html, /Tienes cambios de asistencia pendientes|Salir sin guardar/);
    if (closing) assert.match(html, /procesando o verificando el cierre.*Abandonar la pantalla/);
    else assert.doesNotMatch(html, /procesando o verificando el cierre/);
    assert.match(html, /disabled=""/);
  });
}
