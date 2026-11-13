import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CanceledError } from 'axios';
import { connectHttpSession } from '../../shared/api/httpClient';
import { AuthContext } from './AuthContext';
import { getCurrentUser, login } from './auth.api';
import type { AuthSession, LoginCredentials } from './auth.types';

type ActiveRequest = { token: string | null; controller: AbortController };

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [notice, setNotice] = useState('');
  const active = useRef<ActiveRequest | null>(null);

  const endSession = useCallback((message = '') => {
    active.current?.controller.abort();
    active.current = null;
    setSession(null);
    setNotice(message);
  }, []);

  useEffect(() => {
    const disconnect = connectHttpSession({
      current: () => {
        const request = active.current;
        return request?.token ? { token: request.token, signal: request.controller.signal } : null;
      },
      unauthorized: token => {
        if (active.current?.token === token) endSession('La sesión ya no es válida. Inicia sesión nuevamente.');
      },
    });
    return () => {
      disconnect();
      active.current?.controller.abort();
      active.current = null;
    };
  }, [endSession]);

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiration() {
      if (!session) return;
      const remaining = session.expiresAt - Date.now();
      if (remaining <= 0) endSession('Tu sesión ha vencido. Inicia sesión nuevamente.');
      else timer = setTimeout(checkExpiration, Math.min(remaining, 2147483647));
    }
    checkExpiration();
    const checkOnFocus = () => { clearTimeout(timer); checkExpiration(); };
    window.addEventListener('focus', checkOnFocus);
    return () => { clearTimeout(timer); window.removeEventListener('focus', checkOnFocus); };
  }, [session, endSession]);

  async function signIn(credentials: LoginCredentials) {
    endSession();
    const request: ActiveRequest = { token: null, controller: new AbortController() };
    active.current = request;
    const startedAt = Date.now();
    try {
      const result = await login(credentials, request.controller.signal);
      if (active.current !== request) throw new CanceledError();
      if (!result.access_token || result.token_type !== 'Bearer'
        || !Number.isSafeInteger(result.expires_in) || result.expires_in < 1) {
        throw new Error('Respuesta de autenticación inválida.');
      }
      request.token = result.access_token;
      const user = await getCurrentUser(request.controller.signal);
      if (active.current !== request) throw new CanceledError();
      const expiresAt = startedAt + result.expires_in * 1000;
      if (expiresAt <= Date.now()) throw new Error('La sesión recibida ya ha vencido.');
      setSession({ user, expiresAt });
    } catch (error) {
      if (active.current === request) endSession();
      throw error;
    }
  }

  async function verifySession() {
    const request = active.current;
    if (!request?.token) return;
    const user = await getCurrentUser(request.controller.signal);
    if (active.current === request) setSession(current => current ? { ...current, user } : null);
  }

  return (
    <AuthContext.Provider value={{ session, notice, signIn, signOut: () => endSession(), verifySession }}>
      {children}
    </AuthContext.Provider>
  );
}
