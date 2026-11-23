import type { LoginResponse } from './auth.types';

export function tokenResponse(result: LoginResponse) {
  if (typeof result.access_token !== 'string' || !result.access_token.trim() || result.token_type !== 'Bearer'
    || !Number.isSafeInteger(result.expires_in) || result.expires_in < 1
    || !Number.isSafeInteger(result.expires_at) || !Number.isSafeInteger(result.session_expires_at)) {
    throw new Error('Respuesta de autenticación inválida.');
  }
  const expiresAt = result.expires_at * 1000, absoluteExpiresAt = result.session_expires_at * 1000;
  if (!Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(absoluteExpiresAt)
    || expiresAt <= Date.now() || expiresAt > absoluteExpiresAt) throw new Error('Vencimiento inválido.');
  return { token: result.access_token, expiresAt, absoluteExpiresAt };
}
