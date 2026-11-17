import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { data } from './support/attendanceFixture.mjs';

let vite, api, http, editor;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/asistencias/asistencias.api.ts');
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  editor = await vite.ssrLoadModule('/src/features/asistencias/attendanceEditorState.ts');
});
after(async () => { await vite?.close(); });
const closed = () => ({ ...structuredClone(data), sesion: { ...data.sesion, estado: 'CERRADA', version: 8 },
  advertencias: [{ codigo: 'PENDIENTES_AL_CERRAR', cantidad: 1 }] });

test('cierre usa ID BIGINT de sesión, POST y solo la versión confirmada; consume advertencias y padrón', async () => {
  const calls = [];
  http.httpClient.defaults.adapter = async config => {
    calls.push({ method: config.method, url: config.url, body: JSON.parse(config.data) });
    return { config, status: 200, headers: {}, data: closed() };
  };
  const result = await api.closeAttendance(data.sesion.id, data.sesion.version);
  assert.deepEqual(calls, [{ method: 'post', url: `/asistencias/sesiones/${data.sesion.id}/cierre`, body: { version: 7 } }]);
  assert.deepEqual(result.advertencias, [{ codigo: 'PENDIENTES_AL_CERRAR', cantidad: 1 }]);
  assert.deepEqual(result.padron, data.padron); assert.deepEqual(result.resumen, data.resumen);
  assert.equal(result.sesion.version, 8);
});

test('un cierre sin confirmación HTTP/estado/advertencias se considera incierto, sin reintentos', async () => {
  for (const [status, response] of [[202, closed()], [200, { ...closed(), sesion: data.sesion }],
    [200, { ...closed(), advertencias: undefined }]]) {
    let calls = 0;
    http.httpClient.defaults.adapter = async config => { calls++; return { config, status, data: response }; };
    await assert.rejects(api.closeAttendance(data.sesion.id, 7)); assert.equal(calls, 1);
  }
});

test('saving bloquea edición; descarte explícito mantiene base y versiones; respuesta vieja se ignora', () => {
  let state = editor.createAttendanceEditor('5', data);
  const id = data.padron[0].asistencia_id;
  state = editor.attendanceEditorReducer(state, { type: 'select', id, state: 'PRESENTE' });
  state = editor.attendanceEditorReducer(state, { type: 'discard', epoch: state.epoch });
  assert.deepEqual(state.changes, {}); assert.equal(state.base, data);
  state = editor.attendanceEditorReducer(state, { type: 'phase', epoch: state.epoch, phase: 'saving', message: '' });
  assert.equal(editor.attendanceEditorReducer(state, { type: 'bulk' }), state);
  const epoch = state.epoch;
  state = editor.attendanceEditorReducer(state, { type: 'reset', accountId: '6', source: data });
  assert.equal(editor.attendanceEditorReducer(state, { type: 'saved', epoch, data: closed(), message: 'OK' }), state);
  assert.equal(editor.attendanceEditorReducer(state, { type: 'discard', epoch }), state);
});
