import { HttpError } from '../../../shared/http-error.js';
import { validateId, validatePagination } from '../../../shared/query-validation.js';
export { educationLevels as levels } from '../../../shared/education-levels.js';
import { educationLevels as levels } from '../../../shared/education-levels.js';

function invalid() { throw new HttpError(400, 'Datos o filtros de sección inválidos.'); }
function text(value, max) {
  if (typeof value !== 'string' || !value.isWellFormed() || Array.from(value).length > max) invalid();
  return value;
}
function grade(value, level) {
  if (!Number.isInteger(value) || value < 1 || value > (level === 'SECUNDARIA' ? 5 : 6)) invalid();
  if (level === 'INICIAL' && ![4, 5].includes(value)) invalid();
  return value;
}

export function validateSectionPatch(body, level) {
  const fields = ['grado', 'letra', 'activo'];
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(body) || Object.keys(body).length !== 2 || !object(body.esperado) || !object(body.cambios)
    || Object.keys(body).some(key => !['esperado', 'cambios'].includes(key))
    || fields.some(key => !Object.hasOwn(body.esperado, key))
    || Object.keys(body.esperado).some(key => !fields.includes(key))
    || !Object.keys(body.cambios).length || Object.keys(body.cambios).some(key => !fields.includes(key))) invalid();
  for (const data of [body.esperado, body.cambios]) {
    if (Object.hasOwn(data, 'grado')) grade(data.grado, level);
    if (Object.hasOwn(data, 'letra')) text(data.letra, 30);
    if (Object.hasOwn(data, 'activo') && typeof data.activo !== 'boolean') invalid();
  }
  return { esperado: { ...body.esperado }, cambios: { ...body.cambios } };
}

export function validateNewSection(body) {
  const fields = ['anio_escolar_id', 'nivel', 'grado', 'letra', 'turno'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(field => !fields.includes(field))) invalid();
  validateId(body.anio_escolar_id);
  if (!levels.includes(body.nivel)) invalid();
  const data = { anio_escolar_id: body.anio_escolar_id, nivel: body.nivel,
    grado: grade(body.grado, body.nivel), letra: text(body.letra, 30) };
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

export function validateSectionBatch(body) {
  const fields = ['anio_escolar_id', 'nivel', 'grado', 'letra_desde', 'letra_hasta'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== fields.length || Object.keys(body).some(key => !fields.includes(key))
    || typeof body.letra_desde !== 'string' || typeof body.letra_hasta !== 'string'
    || !/^[A-Z]$/.test(body.letra_desde ?? '') || !/^[A-Z]$/.test(body.letra_hasta ?? '')
    || body.letra_hasta < body.letra_desde) {
    throw new HttpError(400, 'Indica un rango válido de A a Z; la letra final no puede ser anterior a la inicial.');
  }
  const data = validateNewSection({ anio_escolar_id: body.anio_escolar_id, nivel: body.nivel,
    grado: body.grado, letra: body.letra_desde });
  return Array.from({ length: body.letra_hasta.charCodeAt(0) - body.letra_desde.charCodeAt(0) + 1 },
    (_, index) => ({ ...data, letra: String.fromCharCode(body.letra_desde.charCodeAt(0) + index) }));
}
