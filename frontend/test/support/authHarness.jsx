import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AxiosError } from 'axios';
import App from '../../src/app/App';
import { router } from '../../src/app/router';
import { httpClient } from '../../src/shared/api/httpClient';
import { AUTH_STORAGE_KEY } from '../../src/features/auth/authStorage';
import '../../src/app/styles.css';

const query = new URLSearchParams(location.search);
const controls = { documentId: crypto.randomUUID(), calls: [], meStatus: query.get('me'), holdMe: query.has('hold'), pending: [], offset: 0,
  userName: 'Perfil validado', expiresIn: 900 };
window.authTest = controls;
controls.navigate = router.navigate;
const realNow = Date.now; Date.now = () => realNow() + controls.offset;
const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
const nativeSet = Storage.prototype.setItem, nativeRemove = Storage.prototype.removeItem;
controls.restoreStorage = () => {
  Object.defineProperty(window, 'sessionStorage', storageDescriptor);
  Storage.prototype.setItem = nativeSet; Storage.prototype.removeItem = nativeRemove;
};
if (query.get('storage') === 'blocked') Object.defineProperty(window, 'sessionStorage', {
  configurable: true, get() { throw new DOMException('Bloqueado en prueba', 'SecurityError'); } });
if (['write', 'clear'].includes(query.get('storage'))) Storage.prototype.setItem = function (key, value) {
  if (key === AUTH_STORAGE_KEY) throw new DOMException('Bloqueado en prueba', 'QuotaExceededError');
  return nativeSet.call(this, key, value);
};
if (query.get('storage') === 'clear') Storage.prototype.removeItem = function (key) {
  if (key === AUTH_STORAGE_KEY) throw new DOMException('Bloqueado en prueba', 'SecurityError');
  return nativeRemove.call(this, key);
};
controls.releaseMe = () => { const pending = controls.pending.splice(0); pending.forEach(resolve => resolve()); };
controls.verify = () => httpClient.get('/auth/me').catch(() => {});
httpClient.defaults.adapter = async config => {
  controls.calls.push({ method: config.method, url: config.url, bearer: Boolean(config.headers.get('Authorization')) });
  let result;
  if (config.url === '/auth/login') result = { access_token: 'credencial-simulada-sin-validez-real', token_type: 'Bearer', expires_in: controls.expiresIn };
  else if (config.url === '/auth/me') {
    if (controls.holdMe) await new Promise(resolve => controls.pending.push(resolve));
    if (controls.meStatus) throw new AxiosError('Detalle privado simulado', controls.meStatus === 'timeout' ? 'ECONNABORTED' : '', config,
      null, ['network', 'timeout'].includes(controls.meStatus) ? undefined : { config, status: Number(controls.meStatus) });
    result = { user: { id: '9007199254740993', nombres: controls.userName, apellidos: 'Prueba', usuario: 'simulado',
      rol: 'REGISTRADOR', cargo: 'DOCENTE', nivel_asignado: 'INICIAL', puede_escanear_qr: false, puede_usar_bitacora: false } };
  } else if (config.url === '/secciones/') result = { secciones: [], pagination: { page: 1, limit: 100, has_more: false } };
  else if (config.url === '/anios-escolares') result = { anios_escolares: [], pagination: { page: 1, limit: 100, has_more: false } };
  else throw new Error('Solicitud no prevista por la prueba de autenticación');
  return { config, data: result, status: 200, statusText: 'OK', headers: {} };
};
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
