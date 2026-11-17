import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { supervisionDetail } from './support/supervisionDetailFixture.mjs';
import { searchRows, searchResponse } from './support/globalStudentSearchFixture.mjs';

let vite, api, http;
const detail = supervisionDetail(), date = detail.sesion.fecha;
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/asistencias/gestion/studentSearch.api.ts');
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
});
after(async () => { await vite?.close(); });

test('búsqueda global usa solo GET fecha/q/page/limit=20, conserva IDs, null, versiones y paginación', async () => {
  const calls = [], rows = searchRows(detail);
  http.httpClient.defaults.adapter = async config => {
    calls.push(config); assert.equal(config.method, 'get'); assert.equal(config.url, '/asistencias/busqueda-estudiantes');
    assert.deepEqual(config.params, { fecha: date, q: ' Estudiante   1 ', page: 1, limit: 20 });
    return response(config, searchResponse(config, rows));
  };
  const data = await api.searchAttendanceStudents(date, ' Estudiante   1 ', 1);
  assert.equal(data.q, 'Estudiante 1'); assert.equal(data.resultados[0].asistencia_id, detail.padron[0].asistencia_id);
  assert.equal(data.resultados[0].asistencia_version, 1); assert.equal(calls.length, 1);
});

test('validación de texto Unicode, controles, fechas y página impide peticiones inválidas', async () => {
  assert.equal(api.validSearchQuery('😀'.repeat(120)), true);
  for (const value of ['a'.repeat(121), '\n', '\u007f', '\ud800']) assert.equal(api.validSearchQuery(value), false);
  let calls = 0; http.httpClient.defaults.adapter = async () => { calls++; throw new Error('No debe llamar'); };
  for (const [fecha, q, page] of [['2026-02-30', '', 1], [date, 'a'.repeat(121), 1], [date, '', 0]]) {
    await assert.rejects(api.searchAttendanceStudents(fecha, q, page));
  }
  assert.equal(calls, 0);
});

test('PENDIENTE real versión cero difiere de SIN_ASISTENCIA y SIN_SESION, que no autorizan actualización', async () => {
  const rows = searchRows(detail), noSession = { ...rows[0], matricula_id: '100', matricula_seccion_id: '101',
    situacion: 'SIN_SESION', estado: null, sesion_id: null, sesion_estado: null, sesion_version: null, asistencia_id: null, asistencia_version: null };
  const noAttendance = { ...rows[1], matricula_id: '102', matricula_seccion_id: '103',
    situacion: 'SIN_ASISTENCIA', estado: null, asistencia_id: null, asistencia_version: null };
  http.httpClient.defaults.adapter = async config => response(config, searchResponse(config, [...rows, noSession, noAttendance]));
  const data = await api.searchAttendanceStudents(date, '', 1);
  assert.equal(api.canUpdateSearchRow(data.resultados[3]), true); assert.equal(data.resultados[3].asistencia_version, 0);
  assert.equal(api.canUpdateSearchRow(data.resultados[5]), false); assert.equal(api.canUpdateSearchRow(data.resultados[6]), false);
  await assert.rejects(api.getSearchCorrectionDetail(noAttendance)); await assert.rejects(api.getSearchCorrectionDetail(noSession));
});

test('respuesta de fecha/página ajenas, duplicados y ausencia convertida en FALTA se rechazan', async () => {
  for (const mutate of [data => { data.fecha = '2026-11-14'; }, data => { data.pagination.page = 2; },
    data => { data.resultados.push(data.resultados[0]); }, data => { data.resultados[0].situacion = 'SIN_SESION'; },
    data => { data.resultados[0].asistencia_version = null; }, data => { data.resultados[0].asistencia_id = 1; }]) {
    http.httpClient.defaults.adapter = async config => { const data = searchResponse(config, searchRows(detail)); mutate(data); return response(config, data); };
    await assert.rejects(api.searchAttendanceStudents(date, '', 1));
  }
});

test('selección exige identidad completa y versiones exactas antes de abrir el formulario existente', async () => {
  const row = searchRows(detail)[0]; let calls = 0;
  http.httpClient.defaults.adapter = async config => { calls++; assert.equal(config.url, `/asistencias/sesiones/${row.sesion_id}`); return response(config, detail); };
  assert.deepEqual(await api.getSearchCorrectionDetail(row), detail); assert.equal(calls, 1);
  for (const change of [{ sesion_version: 2 }, { asistencia_version: 0 }, { matricula_id: '2' },
    { matricula_seccion_id: '2' }, { estudiante: { ...row.estudiante, id: '2' } }, { estado: 'FALTA' },
    { fecha: '2026-11-14' }, { seccion: { ...row.seccion, id: '2' } }, { anio_escolar: { id: '2', anio: 2025 } }]) {
    await assert.rejects(api.getSearchCorrectionDetail({ ...row, ...change }), /datos cambiaron/);
  }
});

test('errores de búsqueda no son vacíos; 401 conserva señal y manejo de sesión compartido', async () => {
  for (const status of [400, 403, 404, 409, 500, undefined]) {
    http.httpClient.defaults.adapter = async config => { throw new AxiosError('Privado', '', config, null, status ? { status, config } : undefined); };
    await assert.rejects(api.searchAttendanceStudents(date, '', 1));
  }
  const signal = new AbortController().signal, expired = [];
  const disconnect = http.connectHttpSession({ current: () => ({ token: 'simulado', signal }), unauthorized: token => expired.push(token) });
  try {
    http.httpClient.defaults.adapter = async config => {
      assert.equal(config.signal, signal); throw new AxiosError('Privado', '', config, null, { status: 401, config });
    };
    await assert.rejects(api.searchAttendanceStudents(date, '', 1)); assert.deepEqual(expired, ['simulado']);
  } finally { disconnect(); }
});
