import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { educationLevels } from '../../shared/education-levels.js';

export function statisticsQuery(query) {
  const fields = ['anio_escolar_id', 'fecha_desde', 'fecha_hasta', 'nivel'];
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !fields.includes(key))) {
    throw new HttpError(400, 'Filtros de estadísticas inválidos.');
  }
  validateId(query.anio_escolar_id);
  if (!validDate(query.fecha_desde) || !validDate(query.fecha_hasta) || query.fecha_desde > query.fecha_hasta) {
    throw new HttpError(400, 'Se requiere un rango de fechas civiles válido y ordenado.');
  }
  if (query.nivel !== undefined && !educationLevels.includes(query.nivel)) {
    throw new HttpError(400, 'Nivel educativo inválido.');
  }
  return { anio_escolar_id: query.anio_escolar_id, fecha_desde: query.fecha_desde,
    fecha_hasta: query.fecha_hasta, ...(query.nivel === undefined ? {} : { nivel: query.nivel }) };
}
