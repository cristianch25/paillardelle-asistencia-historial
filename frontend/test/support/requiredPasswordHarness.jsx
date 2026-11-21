import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const original = httpClient.defaults.adapter;
const controls = { required: new URLSearchParams(location.search).get('required') !== '0', calls: [],
  writeStatus: null, persistOnError: false, meStatus: null };
window.passwordTest = controls;
const fail = (config, status, error, code) => {
  throw new AxiosError('Detalle privado', '', config, null, { config, status, data: { error, code } });
};
controls.trigger = () => httpClient.get('/usuarios').catch(() => {});
httpClient.defaults.adapter = async config => {
  controls.calls.push({ url: config.url, method: config.method });
  if (config.url === '/auth/me') {
    if (controls.meStatus) fail(config, controls.meStatus, 'Perfil no disponible.');
    const response = await original(config);
    Object.assign(response.data.user, { rol: 'ADMIN', debe_cambiar_password: controls.required });
    return response;
  }
  if (config.url === '/auth/cambiar-contrasena') {
    const input = JSON.parse(config.data);
    if (input.password_actual !== 'InicialFicticia123') fail(config, 400, 'Contraseña actual incorrecta.');
    if (input.password_actual === input.password_nueva) fail(config, 400, 'La nueva contraseña debe ser distinta de la contraseña actual.');
    if (!controls.writeStatus || controls.persistOnError) controls.required = false;
    if (controls.writeStatus) fail(config, controls.writeStatus, 'Error no confirmado.');
    return { config, status: 200, headers: {}, data: { message: 'Contraseña cambiada correctamente.' } };
  }
  if (!config.url.startsWith('/auth/') && controls.required) fail(config, 403, 'Debes cambiar tu contraseña antes de continuar.', 'PASSWORD_CHANGE_REQUIRED');
  return original(config);
};
