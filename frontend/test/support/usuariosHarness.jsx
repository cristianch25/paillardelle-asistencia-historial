import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { usersFixture } from './usuariosFixture.mjs';

const authAdapter = httpClient.defaults.adapter;
const controls = { ...structuredClone(usersFixture()), calls: [], role: 'ADMIN', status: null, writeStatus: null, hold: false, pending: [] };
window.usersTest = controls;
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) {
    const result = await authAdapter(config);
    if (config.url === '/auth/me') Object.assign(result.data.user, { rol: controls.role, cargo: null });
    return result;
  }
  const body = config.data ? JSON.parse(config.data) : undefined;
  controls.calls.push({ method: config.method, url: config.url, params: config.params, body });
  const fail = status => { throw new AxiosError('Privado', '', config, null, status === 'network' ? undefined : { config, status, data: { error: 'Datos rechazados por el servidor.' } }); };
  if (config.method === 'get') {
    const key = ({ '/usuarios': 'users', '/asignaciones': 'asignaciones', '/secciones/': 'secciones', '/anios-escolares': 'anios_escolares' })[config.url];
    const rows = ({ users: controls.users, asignaciones: controls.assignments, secciones: controls.sections, anios_escolares: controls.years })[key];
    const data = structuredClone({ [key]: rows, pagination: { page: config.params.page, limit: 100, has_more: false } });
    const status = controls.status;
    if (controls.hold && config.url === '/usuarios') await new Promise(resolve => controls.pending.push(resolve));
    if (status) fail(status);
    return { config, data, status: 200, statusText: 'OK', headers: {} };
  }
  if (controls.writeStatus && !['network', 500].includes(controls.writeStatus)) fail(controls.writeStatus);
  let data, status = 200;
  if (config.url === '/usuarios') {
    const fields = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'password'));
    const user = { id: String(9007199254750000n + BigInt(controls.users.length)), activo: true, ...fields };
    controls.users.push(user); data = { user }; status = 201;
  } else if (config.url === '/asignaciones') {
    const asignacion = { id: String(9007199254760000n + BigInt(controls.assignments.length)), ...body };
    controls.assignments.push(asignacion); data = { asignacion }; status = 201;
  } else if (config.url.startsWith('/usuarios/')) {
    const user = controls.users.find(row => row.id === config.url.split('/')[2]);
    Object.assign(user, body); data = { user };
  } else throw new Error('Escritura no prevista.');
  if (controls.writeStatus) fail(controls.writeStatus);
  return { config, data: structuredClone(data), status, statusText: 'OK', headers: {} };
};
