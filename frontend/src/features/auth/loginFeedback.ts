import axios from 'axios';

export type LoginFeedback = { remaining: number | null; waitUntil: number | null; receivedAt?: number };
export function loginFieldErrors(usuario: string, password: string) {
  return {
    usuario: !usuario.trim() ? 'El usuario es obligatorio'
      : Array.from(usuario).length > 60 ? 'El usuario ingresado es demasiado largo' : undefined,
    password: !password ? 'La contraseña es obligatoria'
      : new TextEncoder().encode(password).length > 72 ? 'La contraseña ingresada es demasiado larga' : undefined,
  };
}
export function loginFeedback(error: unknown): LoginFeedback | null {
  if (!axios.isAxiosError(error) || error.config?.url !== '/auth/login'
    || ![401, 429].includes(error.response?.status ?? 0)) return null;
  const data = error.response?.data;
  const remaining = Number.isInteger(data?.intentos_restantes)
    && data.intentos_restantes >= 0 && data.intentos_restantes <= 5 ? data.intentos_restantes : null;
  const delays = [data?.reintentar_en_segundos, Number(error.response?.headers?.['retry-after'])]
    .filter(value => Number.isInteger(value) && value > 0 && value <= 86400);
  const delay = delays.length ? Math.max(...delays) : 0, receivedAt = Date.now();
  const waitUntil = delay ? receivedAt + delay * 1000 : null;
  return remaining === null && waitUntil === null ? null
    : { remaining, waitUntil, ...(waitUntil ? { receivedAt } : {}) };
}
