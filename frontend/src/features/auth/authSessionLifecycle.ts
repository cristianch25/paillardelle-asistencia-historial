import axios, { CanceledError } from 'axios';
import { connectHttpSession } from '../../shared/api/httpClient';
import { getCurrentUser, login } from './auth.api';
import { clearStoredAuth, readStoredAuth, writeStoredAuth } from './authStorage';
import { watchAuthExpiration } from './authExpiration';
import type { AuthSession, LoginCredentials } from './auth.types';

type Request = { token: string | null; controller: AbortController; expiresAt: number | null };
export type AuthSnapshot = { session: AuthSession | null; notice: string;
  initialization: 'checking' | 'ready' | 'error'; restoreError: string };
const expiredNotice = 'Tu sesión ha vencido. Inicia sesión nuevamente.';

export function createAuthSessionLifecycle() {
  let state: AuthSnapshot = { session: null, notice: '', initialization: 'checking', restoreError: '' };
  let active: Request | null = null, stopExpiration = () => {};
  let latestProfileCheck: object | null = null;
  const listeners = new Set<() => void>();
  function publish(next: Partial<AuthSnapshot>) {
    state = { ...state, ...next }; listeners.forEach(listener => listener());
  }
  function cancel() { active?.controller.abort(); active = null; stopExpiration(); }
  function endSession(notice = '') {
    cancel();
    const cleared = clearStoredAuth();
    if (!cleared) notice = 'Se cerró la sesión en esta página. El navegador impidió limpiar el acceso guardado; cierra esta pestaña.';
    publish({ session: null, notice, initialization: 'ready', restoreError: '' });
    return cleared;
  }
  function checkCurrent(request: Request) {
    if (active !== request) throw new CanceledError();
    if (request.expiresAt !== null && request.expiresAt <= Date.now()) {
      endSession(expiredNotice); throw new CanceledError();
    }
  }
  function armExpiration(request: Request) {
    stopExpiration();
    stopExpiration = watchAuthExpiration(request.expiresAt!, () => {
      if (active === request) endSession(expiredNotice);
    });
    if (active !== request) stopExpiration();
  }
  async function restore() {
    if (active && state.initialization === 'checking') return;
    cancel(); publish({ session: null, notice: '', initialization: 'checking', restoreError: '' });
    const { credential, unavailable } = readStoredAuth();
    if (!credential) {
      publish({ initialization: 'ready', notice: unavailable ? 'El navegador no permite recuperar la sesión. Inicia sesión para continuar.' : '' });
      return;
    }
    const request: Request = { ...credential, controller: new AbortController() }; active = request;
    armExpiration(request);
    try {
      checkCurrent(request);
      const user = await getCurrentUser(request.controller.signal);
      checkCurrent(request);
      publish({ session: { user, expiresAt: credential.expiresAt }, initialization: 'ready' });
    } catch (error) {
      if (active !== request) return;
      if (axios.isAxiosError(error) && error.response?.status === 401) endSession('La sesión ya no es válida. Inicia sesión nuevamente.');
      else {
        request.controller.abort(); publish({ session: null, initialization: 'error',
          restoreError: 'No se pudo comprobar la sesión. Comprueba tu conexión y vuelve a intentarlo.' });
      }
    }
  }
  async function signIn(credentials: LoginCredentials) {
    const cleared = endSession();
    const request: Request = { token: null, expiresAt: null, controller: new AbortController() }; active = request;
    const startedAt = Date.now();
    try {
      const result = await login(credentials, request.controller.signal);
      checkCurrent(request);
      if (typeof result.access_token !== 'string' || !result.access_token.trim() || result.token_type !== 'Bearer'
        || !Number.isSafeInteger(result.expires_in) || result.expires_in < 1) throw new Error('Respuesta de autenticación inválida.');
      request.token = result.access_token; request.expiresAt = startedAt + result.expires_in * 1000;
      if (!Number.isSafeInteger(request.expiresAt)) throw new Error('Vencimiento inválido.');
      checkCurrent(request); armExpiration(request);
      const user = await getCurrentUser(request.controller.signal);
      checkCurrent(request);
      const stored = writeStoredAuth({ token: request.token, expiresAt: request.expiresAt });
      publish({ session: { user, expiresAt: request.expiresAt }, initialization: 'ready',
        notice: stored ? '' : 'La sesión está activa solo en esta página. El navegador no permite conservarla al recargar.'
          + (cleared ? '' : ' Tampoco se pudo limpiar el acceso guardado; cierra esta pestaña al terminar.') });
    } catch (error) { if (active === request) endSession(); throw error; }
  }
  async function verifySession() {
    const request = active;
    if (!request?.token || !state.session) return;
    const check = {}; latestProfileCheck = check;
    const user = await getCurrentUser(request.controller.signal);
    checkCurrent(request);
    if (latestProfileCheck !== check) return;
    publish({ session: { user, expiresAt: request.expiresAt! } });
  }
  function connect() {
    const disconnect = connectHttpSession({
      current: () => active?.token ? { token: active.token, signal: active.controller.signal } : null,
      unauthorized: token => { if (active?.token === token) endSession('La sesión ya no es válida. Inicia sesión nuevamente.'); },
      passwordChangeRequired: token => {
        if (active?.token === token && state.session?.user.rol === 'ADMIN') {
          latestProfileCheck = null;
          publish({ session: { ...state.session, user: { ...state.session.user, debe_cambiar_password: true } } });
        }
      },
    });
    return () => { disconnect(); cancel(); };
  }
  return { snapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect, restore, signIn, verifySession, signOut: () => endSession() };
}
