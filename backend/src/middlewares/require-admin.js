import { HttpError } from '../shared/http-error.js';

export function requireAdmin(req, _res, next) {
  if (req.authUser?.rol !== 'ADMIN') {
    throw new HttpError(403, 'Acceso reservado a ADMIN.');
  }
  next();
}
