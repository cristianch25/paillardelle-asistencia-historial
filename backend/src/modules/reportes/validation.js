import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { datesInRange } from '../organizacion-escolar/calendario-lectivo/resolution.js';

export function monthlyQuery(query = {}) {
  const fields = ['anio_escolar_id', 'seccion_id', 'mes'];
  if (Object.keys(query).some(key => !fields.includes(key))) throw new HttpError(400, 'Filtros de ficha mensual no válidos.');
  validateId(query.anio_escolar_id); validateId(query.seccion_id);
  if (typeof query.mes !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(query.mes)) {
    throw new HttpError(400, 'mes debe tener formato YYYY-MM.');
  }
  const desde = `${query.mes}-01`, last = new Date(`${desde}T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { ...Object.fromEntries(fields.map(key => [key, query[key]])), desde, hasta: last.toISOString().slice(0, 10) };
}

export function monthlyDays(desde, hasta) {
  let week = 1;
  return datesInRange(desde, hasta).map((fecha, index) => {
    const weekday = new Date(`${fecha}T00:00:00Z`).getUTCDay();
    if (index && weekday === 1) week++;
    return { fecha, numero: Number(fecha.slice(-2)), dia: ['D', 'L', 'M', 'Mi', 'J', 'V', 'S'][weekday], semana: week };
  });
}
