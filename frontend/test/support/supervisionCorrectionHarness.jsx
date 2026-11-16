import './supervisionHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { supervisionDetail, sessionId } from './supervisionDetailFixture.mjs';
import { searchRows, searchResponse } from './globalStudentSearchFixture.mjs';

const previous = httpClient.defaults.adapter;
const controls = { calls: [], server: supervisionDetail(), status: null, applyBeforeError: false,
  hold: false, pending: [], readStatus: null, holdRead: false, readPending: [], level: 'INICIAL', malformed: false, missing: false,
  searchHold: false, searchPending: [], searchStatus: null, extraRows: [] };
window.supervisionCorrectionTest = controls;
controls.results = () => searchRows(controls.server, controls.server.sesion.fecha, controls.level, controls.missing);
controls.reset = (state = 'ABIERTA') => Object.assign(controls, { server: supervisionDetail(sessionId, state),
  status: null, applyBeforeError: false, hold: false, readStatus: null, holdRead: false, malformed: false, missing: false,
  searchHold: false, searchStatus: null, extraRows: [] });
controls.recount = (server = controls.server) => {
  for (const [state, key] of [['PRESENTE', 'presentes'], ['TARDANZA', 'tardanzas'], ['FALTA', 'faltas'], ['PENDIENTE', 'pendientes']]) {
    server.resumen[key] = server.padron.filter(row => row.estado === state).length;
  }
};
httpClient.defaults.adapter = async config => {
  if (!config.url.startsWith('/asistencias/')) return previous(config);
  const body = config.data ? JSON.parse(config.data) : undefined;
  controls.calls.push({ method: config.method, url: config.url, params: config.params, body });
  const fail = status => { throw new AxiosError('Detalle privado', status === 'timeout' ? 'ECONNABORTED' : '', config, null,
    ['network', 'timeout'].includes(status) ? undefined : { config, status }); };
  const actor = window.supervisionTest;
  const levels = actor.role === 'ADMIN' ? ['INICIAL', 'PRIMARIA', 'SECUNDARIA'] : actor.role === 'SUBDIRECCION'
    ? actor.level === 'PRIMARIA' ? ['INICIAL', 'PRIMARIA'] : [actor.level] : [];
  if (config.url === '/asistencias/busqueda-estudiantes') {
    const data = structuredClone(searchResponse(config, [...searchRows(controls.server, config.params.fecha, controls.level, controls.missing),
      ...controls.extraRows.map(row => ({ ...row, fecha: config.params.fecha }))].filter(row => levels.includes(row.seccion.nivel))));
    const status = controls.searchStatus;
    if (controls.searchHold) await new Promise(resolve => controls.searchPending.push(resolve));
    if (status) fail(status);
    return { config, data, status: 200, headers: {} };
  }
  if (!levels.includes(controls.level)) fail(404);
  if (config.method === 'patch') {
    const server = controls.server, status = controls.status, apply = controls.applyBeforeError;
    if (controls.hold) await new Promise(resolve => controls.pending.push(resolve));
    if (!status || apply) {
      const row = server.padron.find(item => item.asistencia_id === body.cambios[0].asistencia_id);
      if (server.sesion.version !== body.version || row.version !== body.cambios[0].version) fail(409);
      if (server.sesion.estado === 'CERRADA' && !body.cambios[0].motivo?.trim()) fail(400);
      row.estado = body.cambios[0].estado; row.version++; server.sesion.version++; controls.recount(server);
    }
    if (status) fail(status);
    const result = structuredClone(server);
    if (controls.malformed) result.sesion.version--;
    return { config, status: 200, headers: {}, data: result };
  }
  if (config.url === '/asistencias/sesiones') {
    const result = await previous(config);
    for (const row of result.data.secciones) {
      row.seccion.nivel = controls.level;
      if (row.seccion.id === controls.server.sesion.seccion_id) Object.assign(row, {
        sesion_id: controls.missing ? null : sessionId, situacion: controls.missing ? 'SIN_REGISTRO' : controls.server.sesion.estado,
        resumen: controls.missing ? null : structuredClone(controls.server.resumen) });
    }
    return result;
  }
  const result = structuredClone(controls.server), status = controls.readStatus;
  result.sesion.id = config.url.split('/').at(-1);
  if (controls.holdRead) await new Promise(resolve => controls.readPending.push(resolve));
  if (status) fail(status);
  return { config, status: 200, headers: {}, data: result };
};
