import './authHarness.jsx';
import { monthlyFollowupResponse } from './monthlyFollowupFixture.mjs';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { dailyRows, dailyYear } from './adminHomeFixture.mjs';
import { supervisionLevels } from '../../src/features/asistencias/supervision/supervisionAccess';

const authAdapter = httpClient.defaults.adapter;
const controls = { calls: [], role: 'ADMIN', level: 'PRIMARIA', count: 230, status: null, failPage: 2, holdPage: 0, pending: [], noYears: false, outOfScope: false };
window.homeTest = controls;
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) {
    const result = await authAdapter(config);
    if (config.url === '/auth/me') {
      result.data.user.rol = controls.role;
      if (controls.role === 'SUBDIRECCION') result.data.user.nivel_asignado = controls.level;
    }
    return result;
  }
  controls.calls.push({ method: config.method, url: config.url, params: config.params });
  if (config.method !== 'get') throw new Error('Inicio no puede escribir.');
  let data;
  if (config.url === '/asistencias/seguimiento-mensual') data = monthlyFollowupResponse(config.params, 0, []);
  else if (config.url === '/anios-escolares') data = { anios_escolares: controls.noYears ? [] : [dailyYear], pagination: { page: 1, limit: 100, has_more: false } };
  else if (config.url === '/asistencias/sesiones') {
    const page = config.params.page;
    const levels = supervisionLevels({ rol: controls.role, nivel_asignado: controls.level });
    const rows = dailyRows(controls.count, config.params.fecha)
      .filter(row => controls.role !== 'SUBDIRECCION' || controls.outOfScope || levels.includes(row.seccion.nivel));
    data = { anio_escolar_id: config.params.anio_escolar_id, fecha: config.params.fecha,
      secciones: rows.slice((page - 1) * 100, page * 100), pagination: { page, limit: 100, has_more: page * 100 < rows.length } };
    const status = controls.status;
    if (page === controls.holdPage) await new Promise(resolve => controls.pending.push(resolve));
    if (status && page === controls.failPage) throw new AxiosError('Privado', '', config, null, status === 'network' ? undefined : { status, config });
  } else throw new Error(`Consulta no prevista: ${config.url}`);
  return { config, data, status: 200, statusText: 'OK', headers: {} };
};
