import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter;
const state = { role: 'ADMIN', principal: 'PRIMARIA', allowed: ['PRIMARIA', 'SECUNDARIA'], calls: [], exceptions: {}, closed: false, multipleYears: false };
window.calendarTest = state;
httpClient.defaults.adapter = async config => {
  const fail = (status, error) => { throw new AxiosError('detalle privado', '', config, null, { status, data: { error } }); };
  if (config.url === '/auth/me') {
    const response = await previous(config); Object.assign(response.data.user, { rol: state.role, nivel_asignado: state.principal }); return response;
  }
  if (config.url === '/anios-escolares') return { config, status: 200, data: { anios_escolares: [...(state.multipleYears ? [{ id: '11', anio: 2025, estado: 'CERRADO', fecha_inicio: '2025-03-01', fecha_fin: '2025-04-30' }] : []), { id: '10', anio: 2026,
    estado: state.closed ? 'CERRADO' : 'ABIERTO', fecha_inicio: '2026-03-01', fecha_fin: '2026-04-30' }], pagination: { page: 1, limit: 100, has_more: false } } };
  if (!config.url.startsWith('/calendario-lectivo') && config.url !== '/periodos-lectivos') return previous(config);
  state.calls.push({ url: config.url, method: config.method, params: config.params });
  const level = config.params?.nivel ?? config.url.split('/')[4];
  if (state.role === 'REGISTRADOR' || state.role === 'SUBDIRECCION' && !state.allowed.includes(level)) fail(403, 'Nivel no autorizado');
  if (config.url === '/periodos-lectivos') return { config, status: 200, data: { periodos_lectivos: [] } };
  if (config.method === 'put') {
    const body = JSON.parse(config.data), date = config.url.split('/').at(-1);
    const levels = body.niveles ?? [level];
    if (state.role === 'SUBDIRECCION' && levels.some(item => !state.allowed.includes(item))) fail(403, 'Nivel no autorizado');
    if (date === '2026-03-03' && !body.es_lectivo && levels.includes('SECUNDARIA')) fail(409, 'No se puede bloquear una fecha con asistencias.');
    const rows = levels.map(nivel => ({ anio_escolar_id: '10', nivel, fecha: date, es_lectivo: body.es_lectivo, descripcion: body.descripcion }));
    for (const row of rows) state.exceptions[`${row.nivel}:${date}`] = row;
    return { config, status: 200, data: body.niveles ? { excepciones: rows } : { excepcion: rows[0] } };
  }
  const days = [], { desde, hasta, nivel, anio_escolar_id } = config.params;
  for (let date = new Date(`${desde}T00:00:00Z`); date.toISOString().slice(0, 10) <= hasta; date.setUTCDate(date.getUTCDate() + 1)) {
    const fecha = date.toISOString().slice(0, 10), exception = state.exceptions[`${nivel}:${fecha}`];
    days.push({ fecha, es_lectivo: exception?.es_lectivo ?? ![0, 6].includes(date.getUTCDay()),
      origen: exception ? 'EXCEPCION' : 'REGLA_SEMANAL', descripcion: exception?.descripcion ?? null });
  }
  return { config, status: 200, data: { anio_escolar_id, nivel, desde, hasta, dias: days } };
};
