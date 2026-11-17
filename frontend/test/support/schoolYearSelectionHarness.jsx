import './authHarness.jsx';
import { httpClient } from '../../src/shared/api/httpClient';
import { fixtureUser } from './usuariosFixture.mjs';

const authAdapter = httpClient.defaults.adapter;
const makeYear = (id, anio, estado) => ({ id, anio, estado, fecha_inicio: `${anio}-01-01`, fecha_fin: `${anio}-12-31` });
const controls = { calls: [], account: '9007199254740993', role: 'ADMIN',
  years: [makeYear('24', 2024, 'ABIERTO'), makeYear('25', 2025, 'ABIERTO'), makeYear('26', 2026, 'CERRADO'), makeYear('27', 2027, 'PLANIFICADO')] };
window.yearTest = controls;
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) {
    const result = await authAdapter(config);
    if (config.url === '/auth/me') Object.assign(result.data.user, { id: controls.account, rol: controls.role });
    return result;
  }
  controls.calls.push({ url: config.url, method: config.method, params: config.params });
  if (config.method !== 'get') throw new Error('Seleccionar año no debe escribir.');
  const pagination = { page: config.params?.page ?? 1, limit: config.params?.limit ?? 100, has_more: false };
  const sections = controls.years.map(year => ({ id: `${year.id}0`, anio_escolar_id: year.id, nivel: 'PRIMARIA', grado: 1, letra: 'A', activo: true, turno: null }));
  let data;
  if (config.url === '/anios-escolares') data = { anios_escolares: controls.years, pagination };
  else if (config.url === '/usuarios') data = { users: [fixtureUser()], pagination };
  else if (config.url === '/asignaciones') data = { asignaciones: [], pagination };
  else if (config.url === '/secciones/') data = { secciones: sections.filter(row => !config.params.anio_escolar_id || row.anio_escolar_id === config.params.anio_escolar_id), pagination };
  else if (config.url === '/asistencias/sesiones') data = { anio_escolar_id: config.params.anio_escolar_id, fecha: config.params.fecha,
    secciones: sections.filter(row => row.anio_escolar_id === config.params.anio_escolar_id).map(seccion => ({ seccion, es_lectivo: true, situacion: 'SIN_REGISTRO', sesion_id: null, resumen: null })), pagination };
  else throw new Error(`Consulta no prevista: ${config.url}`);
  return { config, data: structuredClone(data), status: 200, statusText: 'OK', headers: {} };
};
