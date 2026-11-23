// Comparte el cliente HTTP y vincula sus peticiones con la sesión autenticada.
import axios from 'axios';

type HttpSession = { token: string; signal: AbortSignal };
type SessionAccess = {
  current: () => HttpSession | null;
  unauthorized: (token: string) => void;
  passwordChangeRequired?: (token: string) => void;
};
let sessionAccess: SessionAccess | undefined;

export function connectHttpSession(access: SessionAccess) {
  sessionAccess = access;
  return () => { if (sessionAccess === access) sessionAccess = undefined; };
}

export const httpClient = axios.create({ baseURL: '/api', timeout: 15000 });

httpClient.interceptors.request.use(config => {
  const session = sessionAccess?.current();
  if (session && config.url !== '/auth/login') {
    config.headers.set('Authorization', `Bearer ${session.token}`);
    config.signal ??= session.signal;
  }
  return config;
});

// Solo una respuesta de la sesión vigente puede restringirla o invalidarla.
httpClient.interceptors.response.use(response => response, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 403 && error.response.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
    const session = sessionAccess?.current();
    if (session && error.config?.headers.get('Authorization') === `Bearer ${session.token}`
      && error.config.signal === session.signal) sessionAccess?.passwordChangeRequired?.(session.token);
  }
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    const session = sessionAccess?.current();
    if (session && error.config?.headers.get('Authorization') === `Bearer ${session.token}`
      && error.config.signal === session.signal) {
      sessionAccess?.unauthorized(session.token);
    }
  }
  return Promise.reject(error);
});
