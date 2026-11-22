import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { data, selection } from './support/attendanceFixture.mjs';

let vite, http, workspace, reconcile, editor, search;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  workspace = await vite.ssrLoadModule('/src/features/asistencias/attendanceWorkspace.ts');
  reconcile = await vite.ssrLoadModule('/src/features/asistencias/attendanceReconciliation.ts');
  editor = await vite.ssrLoadModule('/src/features/asistencias/attendanceEditorState.ts');
  search = await vite.ssrLoadModule('/src/features/asistencias/assignedStudents.api.ts');
});
after(async () => { await vite?.close(); });
const response = (config, value) => ({ config, data: value, status: 200, headers: {} });
function adapter({ existing = false, allowed = true } = {}) {
  const calls = [];
  http.defaults.adapter = async config => {
    calls.push(config); assert.equal(config.method, 'get', 'consultar nunca escribe');
    if (config.url === '/asistencias/sesiones') return response(config, {
      anio_escolar_id: '1', fecha: config.params.fecha,
      secciones: allowed ? [{ seccion: selection.section, situacion: existing ? 'ABIERTA' : 'SIN_REGISTRO',
        sesion_id: existing ? data.sesion.id : null, resumen: existing ? data.resumen : null, es_lectivo: true }] : [],
      pagination: { page: config.params.page, limit: config.params.limit, has_more: false },
    });
    if (config.url.includes('/padron')) return response(config, { seccion: selection.section, fecha: config.params.fecha,
      padron: data.padron.map(row => ({ id: row.matricula_id, matricula_seccion_id: row.matricula_seccion_id, estudiante: row.estudiante })) });
    return response(config, structuredClone(data));
  };
  return calls;
}
test('sin sesión muestra padrón provisional sin POST ni marcas persistidas; existente usa GET', async () => {
  const calls = adapter();
  const preview = await workspace.getAttendanceWorkspace('1', '2', '2026-11-13');
  assert.equal(preview.sesion.id, ''); assert.equal(calls.length, 2);
  assert.ok(preview.padron.every(row => row.estado === 'PENDIENTE' && row.version === 0 && row.asistencia_id.startsWith('preview:')));
  adapter({ existing: true });
  assert.deepEqual(await workspace.getAttendanceWorkspace('1', '2', '2026-11-13'), { ...data, creada: false });
});
test('primer guardado mapea matrícula a ID real y solo envía la marca elegida', async () => {
  adapter(); const preview = await workspace.getAttendanceWorkspace('1', '2', '2026-11-13');
  const id = preview.padron[0].asistencia_id;
  const aligned = reconcile.reconcileAttendance(preview, { [id]: 'TARDANZA' }, data);
  assert.equal(aligned.conflicts.length, 0);
  const patch = reconcile.attendancePatch(data, aligned.changes);
  assert.deepEqual(patch, { version: 7, cambios: [{ asistencia_id: data.padron[0].asistencia_id, version: 0, estado: 'TARDANZA' }] });
  assert.equal(data.padron[1].estado, 'PRESENTE');
  let state = editor.createAttendanceEditor('5', preview);
  state = editor.attendanceEditorReducer(state, { type: 'select', id, state: 'TARDANZA' });
  state = editor.attendanceEditorReducer(state, { type: 'refreshed', epoch: state.epoch, data, message: '' });
  assert.deepEqual(state.changes, aligned.changes); assert.equal(state.base.sesion.id, data.sesion.id);
});
test('sesión creada por otro actor: marca divergente genera conflicto y no se sobrescribe', async () => {
  adapter(); const preview = await workspace.getAttendanceWorkspace('1', '2', '2026-11-13');
  const actual = structuredClone(data); actual.padron[0].estado = 'FALTA'; actual.padron[0].version = 1;
  const result = reconcile.reconcileAttendance(preview, { [preview.padron[0].asistencia_id]: 'TARDANZA' }, actual);
  assert.deepEqual(result.conflicts, [data.padron[0].asistencia_id]);
  const same = reconcile.reconcileAttendance(preview, { [preview.padron[0].asistencia_id]: 'FALTA' }, actual);
  assert.deepEqual(same.changes, {}); assert.deepEqual(same.conflicts, []);
  actual.padron[0].matricula_seccion_id = 'otro';
  assert.throws(() => reconcile.reconcileAttendance(preview, {}, actual), /padrón cambió/);
});
test('búsqueda solo carga secciones autorizadas, no escribe y acepta varias palabras parciales sin tildes', async () => {
  const calls = adapter();
  const rows = await search.loadAssignedStudents([selection.year], '2026-11-13', () => true);
  assert.equal(rows.length, 4);
  assert.equal(search.filterAssignedStudents(rows, '').length, 0);
  assert.equal(search.filterAssignedStudents(rows, 'mari pere 2').length, 1);
  assert.equal(search.filterAssignedStudents(rows, 'no asignado').length, 0);
  const coded = structuredClone(rows); coded[0].row.estudiante.codigo_estudiante = 'FICTICIO-001';
  assert.equal(search.filterAssignedStudents(coded, 'ficticio-001').length, 1);
  assert.ok(calls.every(call => !call.url.includes('busqueda-estudiantes')));
  adapter({ allowed: false });
  assert.deepEqual(await search.loadAssignedStudents([selection.year], '2026-11-13', () => true), []);
  await assert.rejects(workspace.getAttendanceWorkspace('1', '2', '2026-11-13'), /no está disponible/);
  assert.equal(await search.loadAssignedStudents([selection.year], '2026-11-13', () => false), null);
});
