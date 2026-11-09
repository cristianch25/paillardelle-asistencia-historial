import { HttpError } from '../../shared/http-error.js';

export class AuthError extends HttpError {}

export function unauthorized() {
  return new AuthError(401, 'Credenciales o autenticación no válidas.');
}
