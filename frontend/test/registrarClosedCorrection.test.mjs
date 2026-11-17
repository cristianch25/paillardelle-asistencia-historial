import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { data } from './support/attendanceFixture.mjs';

let vite, create, reduce, patch;
const closed = structuredClone(data); closed.sesion.estado = 'CERRADA';
const lateId = data.padron[2].asistencia_id, absentId = data.padron[3].asistencia_id;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ createAttendanceEditor: create, attendanceEditorReducer: reduce } = await vite.ssrLoadModule('/src/features/asistencias/attendanceEditorState.ts'));
  ({ attendancePatch: patch } = await vite.ssrLoadModule('/src/features/asistencias/attendanceReconciliation.ts'));
});
after(async () => { await vite?.close(); });
const select = (editor, id = lateId, state = 'PRESENTE') => reduce(editor, { type: 'select', id, state });

test('CERRADA: seleccion directa envia solo diferencias con versiones y sin motivo', () => {
  for (const [id, state] of [[lateId, 'PRESENTE'], [absentId, 'TARDANZA']]) {
    const editor = select(create('5', closed), id, state);
    assert.deepEqual(patch(editor.base, editor.changes, editor.reasons), { version: 7, cambios: [{
      asistencia_id: id, version: closed.padron.find(row => row.asistencia_id === id).version, estado: state,
    }] });
    assert.deepEqual(editor.base, closed);
    assert.deepEqual(select(editor, id, closed.padron.find(row => row.asistencia_id === id).estado).changes, {});
  }
});

test('30 estudiantes: cambiar uno envia una sola fila; no-op no produce cambios', () => {
  const base = structuredClone(closed);
  base.padron = Array.from({ length: 30 }, (_, i) => ({ ...structuredClone(closed.padron[2]), asistencia_id: String(100 + i) }));
  const editor = select(create('5', base), '115');
  assert.deepEqual(patch(base, editor.changes).cambios, [{ asistencia_id: '115', version: 2, estado: 'PRESENTE' }]);
  assert.deepEqual(patch(base, select(editor, '115', 'TARDANZA').changes).cambios, []);
  assert.ok(base.padron.every(row => row.version === 2));
});

test('marca y justificacion comparten cambio sin motivo ordinario; motivo de justificacion obligatorio', () => {
  let editor = select(create('5', closed), absentId, 'TARDANZA');
  for (const reason of ['', '  ', 'x'.repeat(501), '\uD800']) {
    assert.throws(() => patch(closed, editor.changes, { [absentId]: reason }));
  }
  editor = reduce(editor, { type: 'justify', id: absentId, reason: 'Aviso familiar' });
  const body = patch(closed, editor.changes, editor.reasons);
  assert.equal(body.cambios.length, 1); assert.equal(body.cambios[0].motivo, undefined);
  assert.equal(body.cambios[0].motivo_justificacion, 'Aviso familiar');
});

test('justificada protegida de seleccion y masivo; masivo conserva faltas y tardanzas', () => {
  const base = structuredClone(closed); base.padron[2].justificada = true;
  const editor = create('5', base);
  assert.deepEqual(select(editor).changes, {});
  const bulk = reduce(editor, { type: 'bulk' });
  assert.deepEqual(bulk.changes, { [base.padron[0].asistencia_id]: 'PRESENTE' });
});

test('409 conserva seleccion y exige decision explicita antes de usar version actual', () => {
  let editor = select(create('5', closed));
  editor = reduce(editor, { type: 'refreshed', epoch: editor.epoch, data: structuredClone(closed), message: '' });
  assert.deepEqual(editor.conflicts, []);
  const current = structuredClone(closed); current.sesion.version++; current.padron[2].version++;
  editor = reduce(editor, { type: 'refreshed', epoch: editor.epoch, data: current, message: '' });
  assert.deepEqual(editor.conflicts, [lateId]);
  for (const local of [true, false]) {
    const resolved = reduce(editor, { type: 'resolve', id: lateId, local });
    assert.deepEqual(resolved.conflicts, []);
    assert.equal(patch(current, resolved.changes).cambios.length, local ? 1 : 0);
    if (local) assert.equal(patch(current, resolved.changes).cambios[0].version, 3);
  }
});

test('rechazo conserva cambios; confirmacion, descarte y perdida de acceso los limpian', () => {
  const editor = select(create('5', closed));
  assert.equal(reduce(editor, { type: 'phase', epoch: editor.epoch, phase: 'idle', message: 'Rechazo' }).changes[lateId], 'PRESENTE');
  for (const action of [{ type: 'saved', epoch: editor.epoch, data: closed, message: '' },
    { type: 'discard', epoch: editor.epoch }, { type: 'phase', epoch: editor.epoch, phase: 'denied', message: '' }]) {
    assert.deepEqual(reduce(editor, action).changes, {});
  }
});
