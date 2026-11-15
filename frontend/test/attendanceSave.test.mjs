import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { data } from './support/attendanceFixture.mjs';

let vite, reconcile, editor, api, http, errors;
const id = data.padron[0].asistencia_id;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  const load = name => vite.ssrLoadModule(`/src/features/asistencias/${name}.ts`);
  reconcile = await load('attendanceReconciliation'); editor = await load('attendanceEditorState');
  api = await load('asistencias.api'); errors = await load('attendanceSaveError');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });
const change = (state, index = 0, version = 1) => {
  const next = structuredClone(data); next.sesion.version++;
  Object.assign(next.padron[index], { estado: state, version }); return next;
};

test('PATCH contiene solo diferencias reales, IDs BIGINT exactos y versiones numéricas incluida 0', () => {
  const body = reconcile.attendancePatch(data, { [id]: 'PRESENTE', [data.padron[1].asistencia_id]: 'PRESENTE' });
  assert.deepEqual(body, { version: 7, cambios: [{ asistencia_id: '9007199254740994', version: 0, estado: 'PRESENTE' }] });
  assert.deepEqual(reconcile.attendancePatch(data, {}).cambios, []);
});
test('API usa únicamente GET y PATCH existentes y exige confirmación 200', async () => {
  const body = reconcile.attendancePatch(data, { [id]: 'PRESENTE' });
  const seen = [];
  http.defaults.adapter = async config => {
    seen.push({ method: config.method, url: config.url });
    if (config.method === 'patch') assert.deepEqual(JSON.parse(config.data), body);
    return { config, data: change('PRESENTE'), status: 200, headers: {}, statusText: 'OK' };
  };
  assert.equal((await api.saveAttendance(data.sesion.id, body)).padron[0].version, 1);
  await api.getAttendance(data.sesion.id);
  assert.deepEqual(seen, [{ method: 'patch', url: `/asistencias/sesiones/${data.sesion.id}/registros` },
    { method: 'get', url: `/asistencias/sesiones/${data.sesion.id}` }]);
  http.defaults.adapter = async config => ({ config, data, status: 202 });
  await assert.rejects(api.saveAttendance(data.sesion.id, body));
});
test('confirmación sustituye base, limpia diferencias y usa nuevas versiones para la corrección posterior', () => {
  let state = editor.createAttendanceEditor('5', data);
  state = editor.attendanceEditorReducer(state, { type: 'select', id, state: 'PRESENTE' });
  state = editor.attendanceEditorReducer(state, { type: 'saved', epoch: state.epoch, data: change('PRESENTE'), message: 'OK' });
  assert.deepEqual(state.changes, {}); assert.equal(state.success, true);
  state = editor.attendanceEditorReducer(state, { type: 'select', id, state: 'TARDANZA' });
  assert.equal(state.success, false);
  assert.deepEqual(reconcile.attendancePatch(state.base, state.changes),
    { version: 8, cambios: [{ asistencia_id: id, version: 1, estado: 'TARDANZA' }] });
});
test('otra fila modificada conserva borrador y actualiza versión de sesión sin crear conflicto de esa fila', () => {
  const result = reconcile.reconcileAttendance(data, { [id]: 'PRESENTE' }, change('FALTA', 2, 3));
  assert.deepEqual(result.changes, { [id]: 'PRESENTE' }); assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.updated, [data.padron[2].asistencia_id]);
  assert.equal(reconcile.attendancePatch(result.base, result.changes).version, 8);
});
test('misma fila requiere revisión aunque vuelva al estado original con una versión distinta', () => {
  for (const state of ['TARDANZA', 'PENDIENTE']) {
    const result = reconcile.reconcileAttendance(data, { [id]: 'PRESENTE' }, change(state));
    assert.deepEqual(result.conflicts, [id]); assert.equal(result.changes[id], 'PRESENTE');
  }
});
test('coincidencia tras resultado incierto elimina diferencia sin afirmar confirmación de guardado', () => {
  const initial = editor.createAttendanceEditor('5', data);
  initial.changes = { [id]: 'PRESENTE' };
  const state = editor.attendanceEditorReducer(initial,
    { type: 'refreshed', epoch: initial.epoch, data: change('PRESENTE'), message: 'Consultada' });
  assert.deepEqual(state.changes, {}); assert.equal(state.success, false);
});
test('resolver conflicto permite conservar servidor o selección local; nunca guarda al resolver', () => {
  for (const local of [false, true]) {
    let state = editor.createAttendanceEditor('5', data); state.changes = { [id]: 'PRESENTE' };
    state = editor.attendanceEditorReducer(state, { type: 'refreshed', epoch: state.epoch, data: change('TARDANZA'), message: '' });
    assert.equal(editor.attendanceEditorReducer(state, { type: 'bulk' }), state);
    state = editor.attendanceEditorReducer(state, { type: 'resolve', id, local });
    assert.equal(state.conflicts.length, 0); assert.equal(state.changes[id], local ? 'PRESENTE' : undefined);
    assert.equal(state.success, false);
  }
});
test('saving/refresh-required y sesión cerrada rechazan edición; respuesta tardía no altera nueva cuenta', () => {
  let state = editor.createAttendanceEditor('5', data);
  for (const phase of ['saving', 'refreshing', 'refresh-required']) {
    state = { ...state, phase };
    assert.equal(editor.attendanceEditorReducer(state, { type: 'select', id, state: 'FALTA' }), state);
  }
  const epoch = state.epoch;
  state = editor.attendanceEditorReducer(state, { type: 'reset', accountId: '6', source: data });
  assert.equal(editor.attendanceEditorReducer(state, { type: 'saved', epoch, data: change('PRESENTE'), message: 'OK' }), state);
  const closed = structuredClone(data); closed.sesion.estado = 'CERRADA';
  state = editor.createAttendanceEditor('6', closed);
  assert.equal(editor.attendanceEditorReducer(state, { type: 'bulk' }), state);
});
test('consulta de sesión cerrada conserva selecciones sin permitir corrección posterior al cierre', () => {
  let state = editor.createAttendanceEditor('5', data); state.changes = { [id]: 'PRESENTE' };
  const closed = structuredClone(data); closed.sesion.estado = 'CERRADA';
  state = editor.attendanceEditorReducer(state, { type: 'refreshed', epoch: state.epoch, data: closed, message: '' });
  assert.deepEqual(state.conflicts, [id]);
  assert.equal(editor.attendanceEditorReducer(state, { type: 'resolve', id, local: true }), state);
});
test('rechazo de lote conserva todas las selecciones y perder acceso retira datos de la vista', () => {
  let state = editor.createAttendanceEditor('5', data); state.changes = { [id]: 'FALTA', [data.padron[1].asistencia_id]: 'TARDANZA' };
  state = editor.attendanceEditorReducer(state, { type: 'phase', epoch: state.epoch, phase: 'idle', message: 'Rechazo' });
  assert.equal(Object.keys(state.changes).length, 2); assert.equal(state.base, data);
  state = editor.attendanceEditorReducer(state, { type: 'phase', epoch: state.epoch, phase: 'denied', message: '' });
  assert.equal(state.base, null); assert.deepEqual(state.changes, {});
});
test('no se acepta una respuesta de otra sesión o un padrón incompatible', () => {
  const other = structuredClone(data); other.sesion.id = '999';
  assert.throws(() => reconcile.assertAttendanceResponse(data, other));
  other.sesion.id = data.sesion.id; other.padron.pop();
  assert.throws(() => reconcile.reconcileAttendance(data, { [id]: 'PRESENTE' }, other));
});
test('errores no exponen detalles internos ni atribuyen todos los conflictos a otros usuarios', () => {
  for (const status of [400, 401, 403, 404, 413]) {
    const error = new AxiosError('SQL privado', '', {}, null, { status });
    assert.equal(errors.attendanceFailureStatus(error), status);
    assert.doesNotMatch(errors.attendanceRejection(status), /SQL|HTTP|version/);
  }
  assert.equal(errors.attendanceRejection(409), null); assert.equal(errors.attendanceRejection(500), null);
});
