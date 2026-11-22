import { HttpError } from '../../shared/http-error.js';
import { validateId, validatePagination } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { educationLevels } from '../../shared/education-levels.js';

function invalid() { throw new HttpError(400, 'Datos o filtros de asignación inválidos.'); }
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) invalid();
}
export function validateNewAssignment(body) {
  object(body, ['usuario_id', 'seccion_id', 'fecha_inicio', 'fecha_fin']);
  const data = { usuario_id: validateId(body.usuario_id), seccion_id: validateId(body.seccion_id),
    fecha_inicio: body.fecha_inicio, fecha_fin: body.fecha_fin ?? null };
  if (!validDate(data.fecha_inicio) || (data.fecha_fin !== null
    && (!validDate(data.fecha_fin) || data.fecha_fin < data.fecha_inicio))) invalid();
  return data;
}
export function validateAssignmentBatch(body) {
  if (!body || !Object.hasOwn(body, 'seccion_ids')) return { batch: false, items: [validateNewAssignment(body)] };
  object(body, ['usuario_id', 'anio_escolar_id', 'seccion_ids', 'fecha_inicio', 'fecha_fin']);
  const yearId = validateId(body.anio_escolar_id);
  if (!Array.isArray(body.seccion_ids) || !body.seccion_ids.length || body.seccion_ids.length > 100) invalid();
  const ids = body.seccion_ids.map(validateId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Selecciona cada sección una sola vez.');
  const items = ids.map(seccion_id => validateNewAssignment({ usuario_id: body.usuario_id, seccion_id,
    fecha_inicio: body.fecha_inicio, fecha_fin: body.fecha_fin }));
  items.sort((a, b) => BigInt(a.seccion_id) < BigInt(b.seccion_id) ? -1 : 1);
  return { batch: true, yearId, items };
}
export function validateAssignmentCatalog(query = {}) {
  object(query, ['page', 'limit']);
  return validatePagination(query);
}
export function validateAssignmentQuery(query = {}) {
  object(query, ['page', 'limit', 'usuario_id', 'seccion_id', 'anio_escolar_id', 'nivel', 'vigencia']);
  const filters = {};
  for (const key of ['usuario_id', 'seccion_id', 'anio_escolar_id']) {
    if (query[key] !== undefined) filters[key] = validateId(query[key]);
  }
  if (query.nivel !== undefined) {
    if (!educationLevels.includes(query.nivel)) invalid();
    filters.nivel = query.nivel;
  }
  if (query.vigencia !== undefined) {
    if (!['VIGENTE', 'FUTURA', 'FINALIZADA'].includes(query.vigencia)) invalid();
    filters.vigencia = query.vigencia;
  }
  return { ...validatePagination(query), filters };
}
