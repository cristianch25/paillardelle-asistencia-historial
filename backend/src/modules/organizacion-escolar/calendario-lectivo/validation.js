import { HttpError } from '../../../shared/http-error.js';
import { validateId, validatePagination } from '../../../shared/query-validation.js';
import { validDate } from '../../../shared/date-validation.js';
import { educationLevels } from '../../../shared/education-levels.js';
import { daysBetween } from './resolution.js';

function invalid(message) { throw new HttpError(400, message); }
function object(value, fields, nonempty = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (nonempty && !Object.keys(value).length)
    || Object.keys(value).some(key => !fields.includes(key))) invalid('Campos no admitidos.');
}
export function validateLevel(level) {
  if (!educationLevels.includes(level)) invalid('nivel debe ser PRIMARIA, SECUNDARIA o INICIAL.');
  return level;
}
export function validateDate(date) {
  if (!validDate(date)) invalid('Se requiere una fecha real YYYY-MM-DD entre 1000-01-01 y 9999-12-31.');
  return date;
}
export function validateInterval(start, end, bounded = false) {
  validateDate(start); validateDate(end);
  if (start > end) invalid('La fecha inicial debe ser menor o igual a la final.');
  if (bounded && daysBetween(start, end) > 366) invalid('El rango no puede superar 366 fechas inclusivas.');
}
function scope(value) {
  return { anio_escolar_id: validateId(value.anio_escolar_id), nivel: validateLevel(value.nivel) };
}
function description(value) {
  if (typeof value !== 'string' || !value.isWellFormed() || !value.trim()
    || Array.from(value).length > 150) invalid('descripcion requiere un motivo de hasta 150 caracteres.');
  return value;
}
export function validatePeriod(body, partial = false) {
  const dates = ['fecha_inicio', 'fecha_fin'];
  object(body, partial ? dates : ['anio_escolar_id', 'nivel', ...dates], true);
  if (!partial) {
    validateInterval(body.fecha_inicio, body.fecha_fin);
    return { ...scope(body), fecha_inicio: body.fecha_inicio, fecha_fin: body.fecha_fin };
  }
  const patch = {};
  for (const key of dates) if (Object.hasOwn(body, key)) patch[key] = validateDate(body[key]);
  if (patch.fecha_inicio && patch.fecha_fin) validateInterval(patch.fecha_inicio, patch.fecha_fin);
  return patch;
}
export function validateCalendarQuery(query, kind) {
  const fields = ['anio_escolar_id', 'nivel'];
  if (kind !== 'periods') fields.push('desde', 'hasta');
  if (kind !== 'effective') fields.push('page', 'limit');
  object(query, fields);
  const result = scope(query);
  if (kind === 'effective' || query.desde !== undefined || query.hasta !== undefined) {
    validateInterval(query.desde, query.hasta, kind === 'effective');
    result.desde = query.desde; result.hasta = query.hasta;
  }
  return kind === 'effective' ? result : { ...result, ...validatePagination(query) };
}
export function validateException(params, body) {
  object(body, ['es_lectivo', 'descripcion', 'niveles']);
  if (typeof body.es_lectivo !== 'boolean') invalid('es_lectivo debe ser un booleano JSON.');
  if (body.niveles !== undefined && (!Array.isArray(body.niveles) || !body.niveles.length || body.niveles.length > 3
    || new Set(body.niveles).size !== body.niveles.length || body.niveles.some(level => !educationLevels.includes(level))
    || !body.niveles.includes(params.nivel))) invalid('Selecciona niveles válidos y sin repeticiones.');
  return { ...scope(params), fecha: validateDate(params.fecha),
    ...(body.niveles === undefined ? {} : { niveles: educationLevels.filter(level => body.niveles.includes(level)) }),
    es_lectivo: body.es_lectivo, descripcion: description(body.descripcion) };
}
export function validateBlock(body) {
  object(body, ['anio_escolar_id', 'nivel', 'fecha_inicio', 'fecha_fin', 'descripcion']);
  validateInterval(body.fecha_inicio, body.fecha_fin, true);
  return { ...scope(body), fecha_inicio: body.fecha_inicio, fecha_fin: body.fecha_fin,
    descripcion: description(body.descripcion) };
}
