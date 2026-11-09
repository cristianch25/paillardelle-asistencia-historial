import { publicUser } from '../auth/auth.service.js';
import { HttpError } from '../../shared/http-error.js';
import { createUsuariosRepository } from './usuarios.repository.js';

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)
    || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new HttpError(400, 'Paginación inválida: page debe ser positivo y limit debe estar entre 1 y 100.');
  }
  return Number(value);
}

function userDetails(user) {
  return {
    ...publicUser(user),
    activo: Boolean(user.activo),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export function createUsuariosService({ repository = createUsuariosRepository() } = {}) {
  return {
    async list(query = {}) {
      const page = positiveInteger(query.page, 1);
      const limit = positiveInteger(query.limit, 20, 100);
      const offset = (page - 1) * limit;
      if (!Number.isSafeInteger(offset)) {
        throw new HttpError(400, 'La página solicitada está fuera del rango admitido.');
      }
      // Una fila extra permite informar si hay otra página, sin contar toda la tabla.
      const rows = await repository.list({ limit: limit + 1, offset });
      return {
        users: rows.slice(0, limit).map(userDetails),
        pagination: { page, limit, has_more: rows.length > limit },
      };
    },
    async findById(id) {
      if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id)
        || BigInt(id) > 18446744073709551615n) {
        throw new HttpError(400, 'ID inválido: se requiere un entero positivo dentro del rango BIGINT UNSIGNED.');
      }
      const user = await repository.findById(id);
      if (!user) throw new HttpError(404, 'Usuario no encontrado.');
      return userDetails(user);
    },
  };
}
