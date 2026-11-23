import { HttpError } from '../shared/http-error.js';
import { PASSWORD_CHANGE_REQUIRED } from '../modules/auth/auth.access.js';

export function errorHandler(error, _req, res, _next) {
  if (error instanceof HttpError) {
    const loginFeedback = ['LOGIN_FAILED', 'LOGIN_RATE_LIMIT'].includes(error.code);
    if (loginFeedback && error.retryAfter > 0) res.set('Retry-After', String(error.retryAfter));
    if (error.status === 401) res.set('WWW-Authenticate', 'Bearer');
    return res.status(error.status).json({ error: error.message,
      ...(loginFeedback ? { intentos_restantes: error.remainingAttempts,
        reintentar_en_segundos: error.retryAfter } : {}),
      ...(error.code === PASSWORD_CHANGE_REQUIRED ? { code: PASSWORD_CHANGE_REQUIRED } : {}) });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON no válido.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Solicitud demasiado grande.' });
  }
  if (error instanceof URIError && error.status === 400) {
    return res.status(400).json({ error: 'URL no válida.' });
  }
  // No enviar ni registrar el error original: puede contener SQL o credenciales.
  return res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
}
