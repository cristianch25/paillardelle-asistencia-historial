import { HttpError } from '../../shared/http-error.js';
import { validateId, validatePagination } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { validateStudent } from '../estudiantes/validation.js';

function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) throw new HttpError(400, 'Campos inválidos.');
}
export function enrollmentData(body, joint = false) {
  object(body, ['anio_escolar_id', 'seccion_id', 'fecha_ingreso', joint ? 'estudiante' : 'estudiante_id']);
  const data = { anio_escolar_id: validateId(body.anio_escolar_id), seccion_id: validateId(body.seccion_id),
    fecha_ingreso: body.fecha_ingreso };
  if (!validDate(data.fecha_ingreso)) throw new HttpError(400, 'fecha_ingreso explícita inválida.');
  if (joint) data.estudiante = validateStudent(body.estudiante);
  else data.estudiante_id = validateId(body.estudiante_id);
  return data;
}
export function listQuery(query = {}) {
  object(query, ['page', 'limit', 'estudiante_id', 'anio_escolar_id', 'seccion_id', 'fecha']);
  const pagination = validatePagination(query);
  const filters = {};
  for (const key of ['estudiante_id', 'anio_escolar_id', 'seccion_id']) {
    if (query[key] !== undefined) filters[key] = validateId(query[key]);
  }
  if (query.fecha !== undefined) {
    if (!validDate(query.fecha)) throw new HttpError(400, 'Fecha inválida.');
    filters.fecha = query.fecha;
  }
  return { ...pagination, filters };
}
export function padronQuery(id, query) {
  validateId(id);
  object(query, ['fecha']);
  if (!validDate(query.fecha)) throw new HttpError(400, 'Se requiere fecha YYYY-MM-DD válida.');
  return query.fecha;
}

export function withdrawData(body) {
  object(body, ['fecha_retiro', 'fecha_retiro_esperada']);
  if (!validDate(body?.fecha_retiro)) throw new HttpError(400, 'fecha_retiro inválida: se requiere YYYY-MM-DD válida.');
  if (!Object.hasOwn(body, 'fecha_retiro_esperada')
    || (body.fecha_retiro_esperada !== null && !validDate(body.fecha_retiro_esperada))) {
    throw new HttpError(400, 'fecha_retiro_esperada debe ser null o YYYY-MM-DD válida.');
  }
  return { fecha_retiro: body.fecha_retiro, fecha_retiro_esperada: body.fecha_retiro_esperada };
}

export function sectionChangeData(body) {
  object(body, ['seccion_id', 'fecha_efectiva']);
  const seccion_id = validateId(body?.seccion_id);
  if (!validDate(body?.fecha_efectiva)) {
    throw new HttpError(400, 'fecha_efectiva inválida: se requiere YYYY-MM-DD válida.');
  }
  return { seccion_id, fecha_efectiva: body.fecha_efectiva };
}

export function reingresoData(body) {
  object(body, ['seccion_id', 'fecha_reingreso']);
  const seccion_id = validateId(body?.seccion_id);
  if (!validDate(body?.fecha_reingreso)) {
    throw new HttpError(400, 'fecha_reingreso inválida: se requiere YYYY-MM-DD válida.');
  }
  return { seccion_id, fecha_reingreso: body.fecha_reingreso };
}
