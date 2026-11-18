import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { statisticsYear, statisticsResponse } from './statisticsFixture.mjs';

const authAdapter = httpClient.defaults.adapter;
const controls = { role: 'ADMIN', levels: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'], calls: [], status: null, hold: false, pending: [], mode: 'normal' };
window.statisticsTest = controls;
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) {
    const result = await authAdapter(config);
    if (config.url === '/auth/me') result.data.user.rol = controls.role;
    return result;
  }
  controls.calls.push({ method: config.method, url: config.url, params: config.params });
  if (config.method !== 'get') throw new Error('Estadísticas solo consulta.');
  let data;
  if (config.url === '/anios-escolares') data = { anios_escolares: [statisticsYear,
    { ...statisticsYear, id: '2', anio: 2025, fecha_inicio: '2025-03-03', fecha_fin: '2025-12-19' }], pagination: { page: 1, limit: 100, has_more: false } };
  else if (config.url === '/asistencias/sesiones') data = { anio_escolar_id: config.params.anio_escolar_id,
    fecha: config.params.fecha, secciones: [], pagination: { page: 1, limit: 100, has_more: false } };
  else if (config.url === '/asistencias/estadisticas') {
    data = statisticsResponse(config.params); data.niveles_autorizados = [...controls.levels];
    if (controls.mode !== 'normal') {
      data.totales = { presentes: 0, tardanzas: 0, faltas: 0, pendientes: controls.mode === 'pending' ? 7 : 0 };
      data.marcas_registradas = 0; data.sesiones_con_registro = controls.mode === 'empty' ? 0 : 1;
    }
    const status = controls.status;
    if (controls.hold) await new Promise(resolve => controls.pending.push(resolve));
    if (status) throw new AxiosError('Privado', '', config, null, { config, status });
  } else throw new Error(`Consulta inesperada: ${config.url}`);
  return { config, data, status: 200, statusText: 'OK', headers: {} };
};
