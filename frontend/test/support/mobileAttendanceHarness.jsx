import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { selection } from './attendanceFixture.mjs';

const auth = httpClient.defaults.adapter;
const sections = [selection.section, { ...selection.section, id: '3', nivel: 'PRIMARIA', grado: 1, letra: 'GENIALES' }];
const controls = { calls: [], sections, allowed: ['2', '3'], stores: {}, blocked: [], blockedLevels: [], history: [], sequence: 1000, fail: null };
const lective = (level, date) => !controls.blocked.includes(date) && !controls.blockedLevels.includes(`${level}:${date}`);
window.mobileTest = controls;
function roster(section) {
  return ['Ana María', 'Luis Omar'].map((nombres, index) => ({ id: `${section.id}${index}`, estudiante_id: `${section.id}${index}`,
    matricula_seccion_id: `${section.id}${index}0`, seccion_id: section.id, anio_escolar_id: '1', estado: 'ACTIVA',
    estudiante: { id: `${section.id}${index}`, apellido_paterno: 'Pérez', apellido_materno: 'Ríos', nombres, codigo_estudiante: null } }));
}
const visible = () => sections.filter(section => controls.allowed.includes(section.id));
const key = (section, date) => `${section}:${date}`;
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) return auth(config);
  const body = config.data ? JSON.parse(config.data) : undefined;
  controls.calls.push({ method: config.method, url: config.url, params: config.params, body });
  const fail = status => { throw new AxiosError('HTTP ficticio', '', config, null, { config, status, data: { error: 'Operación rechazada' } }); };
  let data;
  if (config.url === '/anios-escolares') data = { anios_escolares: [selection.year], pagination: { page: 1, limit: 100, has_more: false } };
  else if (config.url === '/secciones/') data = { secciones: visible(), pagination: { page: config.params.page, limit: config.params.limit, has_more: false } };
  else if (config.url === '/calendario-lectivo') data = { ...config.params, dias: [{ fecha: config.params.desde,
    es_lectivo: lective(config.params.nivel, config.params.desde), origen: 'EXCEPCION', descripcion: null }] };
  else if (/\/padron$/.test(config.url)) {
    const section = visible().find(item => item.id === config.url.split('/')[2]);
    if (!section) fail(404);
    data = { seccion: section, fecha: config.params.fecha, padron: roster(section) };
  } else if (config.url === '/asistencias/sesiones' && config.method === 'get') {
    const selected = visible().filter(section => !config.params.seccion_id || config.params.seccion_id === section.id);
    if (config.params.seccion_id && !selected.length) fail(404);
    data = { anio_escolar_id: '1', fecha: config.params.fecha, secciones: selected.map(seccion => {
      const stored = controls.stores[key(seccion.id, config.params.fecha)];
      return { seccion, es_lectivo: lective(seccion.nivel, config.params.fecha), situacion: stored ? 'ABIERTA' : 'SIN_REGISTRO',
        sesion_id: stored?.sesion.id ?? null, resumen: stored?.resumen ?? null };
    }), pagination: { page: config.params.page, limit: config.params.limit, has_more: false } };
  } else if (config.url === '/asistencias/sesiones' && config.method === 'post') {
    const section = visible().find(item => item.id === body.seccion_id);
    if (!section) fail(404);
    if (!lective(section.nivel, body.fecha)) fail(409);
    const storeKey = key(section.id, body.fecha), existing = controls.stores[storeKey];
    if (!existing) controls.stores[storeKey] = { sesion: { id: String(++controls.sequence), seccion_id: section.id,
      anio_escolar_id: '1', fecha: body.fecha, estado: 'ABIERTA', version: 1 }, padron: roster(section).map(row => ({
      asistencia_id: `${controls.sequence}${row.id}`, matricula_id: row.id, matricula_seccion_id: row.matricula_seccion_id,
      estudiante: row.estudiante, estado: 'PENDIENTE', version: 0, justificada: false, motivo_justificacion: null, ultimo_cambio: null,
    })), resumen: { total: 2, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 2 } };
    data = { ...controls.stores[storeKey], creada: !existing };
  } else if (config.url.startsWith('/asistencias/sesiones/')) {
    const stored = Object.values(controls.stores).find(item => item.sesion.id === config.url.split('/')[3]);
    if (!stored || !controls.allowed.includes(stored.sesion.seccion_id)) fail(404);
    if (config.method === 'patch') {
      if (controls.fail) fail(controls.fail);
      if (!lective(sections.find(section => section.id === stored.sesion.seccion_id).nivel, stored.sesion.fecha) || body.version !== stored.sesion.version
        || body.cambios.some(change => stored.padron.find(row => row.asistencia_id === change.asistencia_id)?.version !== change.version)) fail(409);
      for (const change of body.cambios) {
        const row = stored.padron.find(item => item.asistencia_id === change.asistencia_id);
        controls.history.push({ id: row.asistencia_id, before: row.estado, after: change.estado });
        row.estado = change.estado; row.version++;
      }
      stored.sesion.version++;
      for (const [label, state] of [['presentes', 'PRESENTE'], ['tardanzas', 'TARDANZA'], ['faltas', 'FALTA'], ['pendientes', 'PENDIENTE']]) {
        stored.resumen[label] = stored.padron.filter(row => row.estado === state).length;
      }
    }
    data = stored;
  } else throw new Error(`Solicitud inesperada ${config.url}`);
  return { config, data: structuredClone(data), status: data.creada ? 201 : 200, statusText: 'OK', headers: {} };
};
