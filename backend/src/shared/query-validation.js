import { HttpError } from './http-error.js';

export function validateId(id) {
  if (typeof id !== 'string' || id.trim() !== id || !/^[1-9]\d{0,19}$/.test(id)
    || BigInt(id) > 18446744073709551615n) {
    throw new HttpError(400, 'ID inválido: se requiere un entero positivo dentro del rango BIGINT UNSIGNED.');
  }
  return id;
}

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim() !== value || !/^[1-9]\d*$/.test(value)
    || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new HttpError(400, 'Paginación inválida: page debe ser positivo y limit debe estar entre 1 y 100.');
  }
  return Number(value);
}

export function validatePagination(query = {}) {
  const page = positiveInteger(query.page, 1);
  const limit = positiveInteger(query.limit, 20, 100);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    throw new HttpError(400, 'La página solicitada está fuera del rango admitido.');
  }
  return { page, limit, offset };
}
