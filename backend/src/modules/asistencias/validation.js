import { HttpError } from '../../shared/http-error.js';
import { validateId, validatePagination } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { educationLevels } from '../../shared/education-levels.js';
import { validateJustification } from './justification.js';

export const states = ['PENDIENTE', 'PRESENTE', 'TARDANZA', 'FALTA'];
function invalid() { throw new HttpError(400, 'Datos de asistencia inválidos.'); }
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) invalid();
}
function version(value, minimum) {
  if (!Number.isInteger(value) || value < minimum || value > 4294967295) invalid();
  return value;
}
export function opening(body) {
  object(body, ['seccion_id', 'fecha']); validateId(body.seccion_id);
  if (!validDate(body.fecha)) invalid();
  return { seccion_id: body.seccion_id, fecha: body.fecha };
}
export function listQuery(query) {
  object(query, ['anio_escolar_id', 'fecha', 'nivel', 'seccion_id', 'page', 'limit']);
  validateId(query.anio_escolar_id);
  if (!validDate(query.fecha)) invalid();
  const data = { anio_escolar_id: query.anio_escolar_id, fecha: query.fecha, ...validatePagination(query) };
  if (query.nivel !== undefined) {
    if (!educationLevels.includes(query.nivel)) invalid();
    data.nivel = query.nivel;
  }
  if (query.seccion_id !== undefined) data.seccion_id = validateId(query.seccion_id);
  return data;
}
export function sessionInput(id, query = {}) {
  validateId(id); object(query, []); return id;
}
export function closing(body) {
  object(body, ['version']); return { version: version(body.version, 1) };
}
export function changes(body) {
  object(body, ['version', 'cambios']); version(body.version, 1);
  if (!Array.isArray(body.cambios) || body.cambios.length < 1 || body.cambios.length > 2000) invalid();
  const ids = new Set();
  for (const row of body.cambios) {
    object(row, ['asistencia_id', 'version', 'estado', 'motivo', 'justificada', 'motivo_justificacion']); validateId(row.asistencia_id);
    version(row.version, 0);
    if (ids.has(row.asistencia_id) || !states.includes(row.estado)) invalid();
    ids.add(row.asistencia_id);
    validateJustification(row);
    if (row.motivo !== undefined && (typeof row.motivo !== 'string' || !row.motivo.isWellFormed()
      || !row.motivo.trim() || [...row.motivo].length > 500)) invalid();
  }
  return body;
}
