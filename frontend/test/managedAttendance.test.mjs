import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { supervisionDetail, sessionId, sectionId } from './support/supervisionDetailFixture.mjs';
import { supervisionResult } from './support/supervisionFixture.mjs';

let vite, http, api;
const filters = { anio_escolar_id: '9007199254740993', fecha: '2026-11-15', seccion_id: sectionId, nivel: 'INICIAL', page: 1 };
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
function lookup(config) {
  const data = supervisionResult(config.params);
  Object.assign(data.secciones[0], { sesion_id: sessionId, situacion: 'ABIERTA' });
  return data;
}
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  api = await vite.ssrLoadModule('/src/features/asistencias/gestion/managedAttendance.api.ts');
});
after(async () => { await vite?.close(); });

test('gestión resuelve la sesión por año/fecha/sección con dos GET existentes, sin apertura ni consultas duplicadas', async () => {
  const calls = [];
  http.httpClient.defaults.adapter = async config => {
    calls.push(config); assert.equal(config.method, 'get');
    return response(config, config.url === '/asistencias/sesiones' ? lookup(config) : supervisionDetail());
  };
  const data = await api.getManagedAttendance(filters, () => true);
  assert.equal(data.detail.attendance.sesion.id, sessionId); assert.equal(data.detail.section.id, sectionId);
  assert.deepEqual(calls.map(c => c.url), ['/asistencias/sesiones', `/asistencias/sesiones/${sessionId}`]);
  assert.deepEqual(calls[0].params, { ...filters, limit: 1 });
});

test('sin sesión devuelve ausencia real y no abre ni consulta un detalle ficticio', async () => {
  let calls = 0;
  http.httpClient.defaults.adapter = async config => { calls++; return response(config, supervisionResult(config.params)); };
  assert.deepEqual(await api.getManagedAttendance(filters, () => true), { detail: null }); assert.equal(calls, 1);
});

test('otro año/fecha/sección/nivel o detalle incompatible se rechazan', async () => {
  for (const mutate of [data => { data.fecha = '2026-11-14'; }, data => { data.anio_escolar_id = '2'; },
    data => { data.secciones[0].seccion.id = '2'; }, data => { data.secciones[0].seccion.nivel = 'SECUNDARIA'; },
    data => { data.secciones[0].seccion.anio_escolar_id = '2'; }]) {
    http.httpClient.defaults.adapter = async config => { const data = lookup(config); mutate(data); return response(config, data); };
    await assert.rejects(api.getManagedAttendance(filters, () => true));
  }
  http.httpClient.defaults.adapter = async config => response(config, config.params ? lookup(config) : supervisionDetail('2'));
  await assert.rejects(api.getManagedAttendance(filters, () => true));
});

test('respuesta obsoleta detiene consultas restantes; errores no se convierten en ausencia de sesión', async () => {
  let current = true, calls = 0;
  http.httpClient.defaults.adapter = async config => { calls++; current = false; return response(config, lookup(config)); };
  assert.equal(await api.getManagedAttendance(filters, () => current), null); assert.equal(calls, 1);
  for (const status of [400, 403, 404, 500, undefined]) {
    http.httpClient.defaults.adapter = async config => { throw new AxiosError('Privado', '', config, null, status ? { status, config } : undefined); };
    await assert.rejects(api.getManagedAttendance(filters, () => true));
  }
});
