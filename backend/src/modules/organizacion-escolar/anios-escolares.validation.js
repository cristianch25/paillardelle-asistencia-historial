import { HttpError } from '../../shared/http-error.js';

function validDate(value) {
  if (typeof value !== 'string' || value.length !== 10
    || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function validateNewYear(body) {
  const fields = ['anio', 'fecha_inicio', 'fecha_fin'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(field => !fields.includes(field))) {
    throw new HttpError(400, 'Se requiere un objeto JSON únicamente con anio, fecha_inicio y fecha_fin.');
  }
  if (!Number.isInteger(body.anio) || body.anio < 2000 || body.anio > 2200) {
    throw new HttpError(400, 'anio debe ser un entero entre 2000 y 2200.');
  }
  if (!validDate(body.fecha_inicio) || !validDate(body.fecha_fin)) {
    throw new HttpError(400, 'Las fechas deben ser reales en formato YYYY-MM-DD, entre 1000-01-01 y 9999-12-31.');
  }
  if (body.fecha_inicio > body.fecha_fin) {
    throw new HttpError(400, 'fecha_inicio debe ser menor o igual a fecha_fin.');
  }
  return Object.fromEntries(fields.map(field => [field, body[field]]));
}
