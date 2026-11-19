import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter;
const state = { role: 'ADMIN', calls: [], fail: 0, years: [
  { id: '10', anio: 2000, fecha_inicio: '2000-01-01', fecha_fin: '2000-12-31', estado: 'PLANIFICADO' },
  { id: '11', anio: 2200, fecha_inicio: '2200-01-01', fecha_fin: '2200-12-31', estado: 'ABIERTO' },
] };
window.yearsTest = state;
httpClient.defaults.adapter = async config => {
  if (config.url === '/auth/me') {
    const response = await previous(config); response.data.user.rol = state.role; return response;
  }
  if (!config.url.startsWith('/anios-escolares')) return previous(config);
  state.calls.push({ url: config.url, method: config.method, body: config.data });
  const fail = (status, error) => { throw new AxiosError('Fallo simulado', '', config, null, { status, data: { error } }); };
  if (config.method === 'get') return { config, status: 200, data: { anios_escolares: structuredClone(state.years), pagination: { page: 1, has_more: false } } };
  if (state.role !== 'ADMIN') fail(403, 'Solo ADMIN');
  if (state.fail) fail(state.fail, state.fail === 409 ? 'El año escolar ya está registrado.' : 'Error interno');
  let year;
  if (config.method === 'post') {
    const input = JSON.parse(config.data);
    if (state.years.some(row => row.anio === input.anio)) fail(409, 'El año escolar ya está registrado.');
    year = { id: String(20 + state.years.length), ...input, estado: 'PLANIFICADO' }; state.years.push(year);
  } else {
    const [id, action] = config.url.split('/').slice(-2); year = state.years.find(row => row.id === id);
    if (!year) fail(404, 'No existe');
    year.estado = action === 'abrir' ? 'ABIERTO' : 'CERRADO';
  }
  return { config, status: 200, data: { anio_escolar: structuredClone(year) } };
};
