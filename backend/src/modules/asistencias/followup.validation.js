import { HttpError } from '../../shared/http-error.js';
import { validateId, validatePagination } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { educationLevels } from '../../shared/education-levels.js';

export function followupQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['anio_escolar_id', 'mes', 'nivel', 'page', 'limit'].includes(key))) {
    throw new HttpError(400, 'Filtros de seguimiento inválidos.');
  }
  validateId(query.anio_escolar_id);
  if (typeof query.mes !== 'string' || !/^[1-9]\d{3}-\d{2}$/.test(query.mes) || !validDate(`${query.mes}-01`)) {
    throw new HttpError(400, 'Se requiere un mes calendario válido (YYYY-MM).');
  }
  if (query.nivel !== undefined && !educationLevels.includes(query.nivel)) throw new HttpError(400, 'Nivel educativo inválido.');
  return { anio_escolar_id: query.anio_escolar_id, mes: query.mes, ...validatePagination(query),
    ...(query.nivel === undefined ? {} : { nivel: query.nivel }) };
}

export function followupDates(month, year) {
  const [yyyy, mm] = month.split('-').map(Number);
  const last = new Date(Date.UTC(yyyy, mm, 0)).getUTCDate();
  const firstDate = `${month}-01`, lastDate = `${month}-${last}`;
  const fecha_desde = firstDate < year.fecha_inicio ? year.fecha_inicio : firstDate;
  const fecha_hasta = lastDate > year.fecha_fin ? year.fecha_fin : lastDate;
  if (fecha_desde > fecha_hasta) throw new HttpError(400, 'El mes no pertenece al año escolar.');
  return { fecha_desde, fecha_hasta };
}
