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

test('incertidumbre bloquea edicion hasta reconciliar sin estado de cierre pendiente', () => {
  let editor = createEditor('5', data);
  for (const phase of ['saving', 'refreshing', 'refresh-required']) {
    editor = reducer(editor, { type: 'phase', epoch: editor.epoch, phase, message: '' });
    assert.equal(reducer(editor, { type: 'bulk' }), editor);
  }
  editor = reducer(editor, { type: 'refreshed', epoch: editor.epoch, data, message: '' });
  assert.equal(editor.phase, 'idle');
  assert.equal(reducer(editor, { type: 'bulk' }).changes[data.padron[0].asistencia_id], 'PRESENTE');
});

for (const dirty of [true, false]) {
  test(`dialogo de salida con borrador=${dirty}, accesible y bloqueado durante escritura`, () => {
    const html = renderToStaticMarkup(createElement(Dialog, { open: true, busy: true, dirty,
      onCancel() {}, onConfirm() {} }));
    assert.match(html, /aria-labelledby="[^"]+" aria-describedby="[^"]+"/);
    if (dirty) assert.match(html, /Tienes cambios de asistencia pendientes/);
    else assert.match(html, /Espera a que termine/);
    assert.doesNotMatch(html, /Cierre de asistencia pendiente/);
    assert.match(html, /disabled=""/);
  });
}
