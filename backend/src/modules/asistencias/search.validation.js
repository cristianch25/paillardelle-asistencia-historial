import { HttpError } from '../../shared/http-error.js';
import { validDate } from '../../shared/date-validation.js';
import { validatePagination } from '../../shared/query-validation.js';

export function studentSearchQuery(query) {
  const invalid = () => { throw new HttpError(400, 'Fecha, texto o filtros de búsqueda inválidos.'); };
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['fecha', 'q', 'page', 'limit'].includes(key)) || !validDate(query.fecha)) invalid();
  const q = query.q === undefined ? '' : query.q;
  if (typeof q !== 'string' || q.length > 240 || !q.isWellFormed()
    || [...q].length > 120 || /[\u0000-\u001f\u007f]/u.test(q)) invalid();
  return { fecha: query.fecha, q: q.trim().replace(/\s+/gu, ' '), ...validatePagination(query) };
}
