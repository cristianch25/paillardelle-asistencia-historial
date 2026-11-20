import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const authAdapter = httpClient.defaults.adapter;
const controls = { role: new URLSearchParams(location.search).get('role') ?? 'SUPERUSUARIO', calls: [],
  users: [{ id: '1', nombres: 'Ana', apellidos: 'Ficticia', usuario: 'admin.ana', rol: 'ADMIN', activo: true },
    { id: '2', nombres: 'Luis', apellidos: 'Ficticio', usuario: 'admin.luis', rol: 'ADMIN', activo: false }],
  readStatus: null, writeStatus: null, holdRead: false, holdWrite: false, pending: [], passwordChanges: 0 };
window.superTest = controls;
controls.release = () => { controls.pending.splice(0).forEach(resolve => resolve()); };
httpClient.defaults.adapter = async config => {
  if (config.url === '/auth/cambiar-contrasena') {
    controls.passwordChanges++; return { config, data: { message: 'Contraseña cambiada correctamente.' }, status: 200, statusText: 'OK', headers: {} };
  }
  if (config.url.startsWith('/auth/')) {
    const response = await authAdapter(config);
    if (config.url === '/auth/me') Object.assign(response.data.user, { rol: controls.role, cargo: null, nivel_asignado: null });
    return response;
  }
  // El registro de llamadas nunca guarda contraseñas ni cuerpos completos.
  controls.calls.push({ method: config.method, url: config.url, page: config.params?.page });
  const fail = (status, message = 'Error simulado del servidor.') => {
    throw new AxiosError('Detalle privado', '', config, null, status === 'network' ? undefined : { config, status, data: { error: message } });
  };
  if (config.url === '/usuarios' && config.method === 'get') {
    if (controls.holdRead) await new Promise(resolve => controls.pending.push(resolve));
    if (controls.readStatus) fail(controls.readStatus);
    const page = config.params.page, limit = config.params.limit;
    return { config, data: { users: structuredClone(controls.users.slice((page - 1) * limit, page * limit)),
      pagination: { page, limit, has_more: page * limit < controls.users.length } }, status: 200, statusText: 'OK', headers: {} };
  }
  if (!config.url.startsWith('/usuarios')) fail(403, 'Solicitud académica prohibida en este arnés.');
  if (controls.holdWrite) await new Promise(resolve => controls.pending.push(resolve));
  if (controls.writeStatus && ![500, 'network'].includes(controls.writeStatus)) fail(controls.writeStatus);
  const body = JSON.parse(config.data);
  let data, status = 200;
  if (config.url === '/usuarios' && config.method === 'post') {
    const { password, ...safe } = body;
    controls.lastCreate = { ...safe, passwordProvided: typeof password === 'string' };
    if (body.rol !== 'ADMIN') fail(403);
    const user = { ...safe, id: String(controls.users.length + 1), activo: true };
    controls.users.push(user); data = { user }; status = 201;
  } else if (config.url.endsWith('/estado')) {
    const user = controls.users.find(user => user.id === config.url.split('/')[2]);
    if (!body.activo && user.activo && controls.users.filter(row => row.activo).length <= 1) fail(409, 'Debe conservarse al menos un ADMIN activo.');
    user.activo = body.activo; data = { user: structuredClone(user) };
  } else if (config.url.endsWith('/restablecer-contrasena')) {
    data = { usuario_id: config.url.split('/')[2], password_temporal: 'S'.repeat(24) };
  } else fail(403);
  if (controls.writeStatus) fail(controls.writeStatus);
  return { config, data, status, statusText: 'OK', headers: {} };
};
