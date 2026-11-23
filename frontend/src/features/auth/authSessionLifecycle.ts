import axios, { CanceledError } from 'axios';
import { connectHttpSession } from '../../shared/api/httpClient';
import { getCurrentUser, login, renewSession, validatedUser } from './auth.api';
import { clearStoredAuth, readStoredAuth, writeStoredAuth, INACTIVITY_MS, type StoredAuth } from './authStorage';
import { watchAuthExpiration } from './authExpiration';
import { watchAuthActivity } from './authActivity';
import { tokenResponse } from './authTokenResponse';
import type { AuthSession, LoginCredentials } from './auth.types';

type Request = { token: string | null; controller: AbortController; expiresAt: number | null;
  absoluteExpiresAt: number; lastActivityAt: number; lastRenewedActivityAt: number };
export type AuthSnapshot = { session: AuthSession | null; notice: string;
  initialization: 'checking' | 'ready' | 'error'; restoreError: string };
const expiredNotice = 'Tu sesión ha vencido. Inicia sesión nuevamente.';

export function createAuthSessionLifecycle() {
  let state: AuthSnapshot = { session: null, notice: '', initialization: 'checking', restoreError: '' };
  let active: Request | null = null, stopExpiration = () => {}, stopActivity = () => {};
  let latestProfileCheck: object | null = null;
  const listeners = new Set<() => void>();
  function publish(next: Partial<AuthSnapshot>) {
    state = { ...state, ...next }; listeners.forEach(listener => listener());
  }
  function cancel() { active?.controller.abort(); active = null; stopExpiration(); stopActivity(); latestProfileCheck = null; }
  const deadline = (request: Request) => Math.min(request.expiresAt!, request.absoluteExpiresAt, request.lastActivityAt + INACTIVITY_MS);
  function credential(request: Request): StoredAuth {
    return { token: request.token!, expiresAt: request.expiresAt!, absoluteExpiresAt: request.absoluteExpiresAt,
      lastActivityAt: request.lastActivityAt, lastRenewedActivityAt: request.lastRenewedActivityAt };
  }
  function endSession(notice = '') {
    cancel();
    const cleared = clearStoredAuth();
    if (!cleared) notice = 'Se cerró la sesión en esta página. El navegador impidió limpiar el acceso guardado; cierra esta pestaña.';
    publish({ session: null, notice, initialization: 'ready', restoreError: '' });
    return cleared;
  }
  function checkCurrent(request: Request) {
    if (active !== request) throw new CanceledError();
    if (request.expiresAt !== null && deadline(request) <= Date.now()) {
      endSession(expiredNotice); throw new CanceledError();
    }
  }
  function armExpiration(request: Request) {
    stopExpiration();
    stopExpiration = watchAuthExpiration(deadline(request), () => {
      if (active === request) endSession(expiredNotice);
    });
    if (active !== request) stopExpiration();
  }
  function track(request: Request) {
    stopActivity();
    stopActivity = watchAuthActivity({
      current: () => active === request && state.session && !state.session.user.debe_cambiar_password ? credential(request) : null,
      changed: time => { request.lastActivityAt = time; writeStoredAuth(credential(request)); armExpiration(request); },
      expired: () => { if (active === request) endSession(expiredNotice); },
      async renew() {
        const token = request.token, activity = request.lastActivityAt, check = {}; latestProfileCheck = check;
        const result = await renewSession(request.controller.signal);
        checkCurrent(request);
        if (request.token !== token || latestProfileCheck !== check) return;
        const next = tokenResponse(result), user = validatedUser(result.user);
        if (next.absoluteExpiresAt !== request.absoluteExpiresAt) throw new Error('Límite de sesión inválido.');
        Object.assign(request, next);
        request.lastRenewedActivityAt = activity;
        writeStoredAuth(credential(request)); armExpiration(request);
        publish({ session: { user, expiresAt: request.expiresAt! } });
      },
    });
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
      track(request);
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
    const request: Request = { token: null, expiresAt: null, absoluteExpiresAt: 0,
      lastActivityAt: Date.now(), lastRenewedActivityAt: Date.now(), controller: new AbortController() }; active = request;
    try {
      const result = await login(credentials, request.controller.signal);
      checkCurrent(request);
      Object.assign(request, tokenResponse(result));
      checkCurrent(request); armExpiration(request);
      const user = await getCurrentUser(request.controller.signal);
      checkCurrent(request);
      const stored = writeStoredAuth(credential(request));
      publish({ session: { user, expiresAt: request.expiresAt! }, initialization: 'ready',
        notice: stored ? '' : 'La sesión está activa solo en esta página. El navegador no permite conservarla al recargar.'
          + (cleared ? '' : ' Tampoco se pudo limpiar el acceso guardado; cierra esta pestaña al terminar.') });
      track(request);
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
