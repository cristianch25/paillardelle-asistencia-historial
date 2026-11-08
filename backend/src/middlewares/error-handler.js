import { AuthError } from '../modules/auth/auth.errors.js';

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AuthError) {
    if (error.status === 401) res.set('WWW-Authenticate', 'Bearer');
    return res.status(error.status).json({ error: error.message });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON no válido.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Solicitud demasiado grande.' });
  }
  // No enviar ni registrar el error original: puede contener SQL o credenciales.
  return res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
}
