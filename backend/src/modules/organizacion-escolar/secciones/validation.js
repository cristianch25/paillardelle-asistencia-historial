import { HttpError } from '../../../shared/http-error.js';
import { validateId, validatePagination } from '../../../shared/query-validation.js';

export const levels = ['PRIMARIA', 'SECUNDARIA'];
function invalid() { throw new HttpError(400, 'Datos o filtros de sección inválidos.'); }
function text(value, max) {
  if (typeof value !== 'string' || !value.isWellFormed() || Array.from(value).length > max) invalid();
  return value;
}
function grade(value, level) {
  if (!Number.isInteger(value) || value < 1 || value > (level === 'SECUNDARIA' ? 5 : 6)) invalid();
  return value;
}

export function validateNewSection(body) {
  const fields = ['anio_escolar_id', 'nivel', 'grado', 'letra', 'turno'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(field => !fields.includes(field))) invalid();
  validateId(body.anio_escolar_id);
  if (!levels.includes(body.nivel)) invalid();
  const data = { anio_escolar_id: body.anio_escolar_id, nivel: body.nivel,
    grado: grade(body.grado, body.nivel), letra: text(body.letra, 5) };
  if (Object.hasOwn(body, 'turno')) data.turno = body.turno === null ? null : text(body.turno, 20);
  return data;
}

export function validateSectionQuery(query = {}) {
  const fields = ['page', 'limit', 'anio_escolar_id', 'nivel', 'grado', 'activo'];
  if (Object.keys(query).some(field => !fields.includes(field))) invalid();
  const filters = {};
  if (query.anio_escolar_id !== undefined) filters.anio_escolar_id = validateId(query.anio_escolar_id);
  if (query.nivel !== undefined) {
    if (!levels.includes(query.nivel)) invalid();
    filters.nivel = query.nivel;
  }
  if (query.grado !== undefined) {
    if (typeof query.grado !== 'string' || query.grado.length !== 1 || !/^[1-6]$/.test(query.grado)) invalid();
    filters.grado = grade(Number(query.grado), filters.nivel);
  }
  if (query.activo !== undefined) {
    if (!['true', 'false'].includes(query.activo)) invalid();
    filters.activo = query.activo === 'true';
  }
  return { ...validatePagination(query), filters };
}
