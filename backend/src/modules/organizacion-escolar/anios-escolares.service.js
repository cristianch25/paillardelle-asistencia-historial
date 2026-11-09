import { HttpError } from '../../shared/http-error.js';
import { validateId, validatePagination } from '../../shared/query-validation.js';
import { createAniosEscolaresRepository } from './anios-escolares.repository.js';

function publicYear(row) {
  return {
    id: String(row.id),
    anio: row.anio,
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
    estado: row.estado,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createAniosEscolaresService({ repository = createAniosEscolaresRepository() } = {}) {
  return {
    async list(query = {}) {
      const { page, limit, offset } = validatePagination(query);
      const rows = await repository.list({ limit: limit + 1, offset });
      return {
        anios_escolares: rows.slice(0, limit).map(publicYear),
        pagination: { page, limit, has_more: rows.length > limit },
      };
    },
    async findById(id) {
      validateId(id);
      const row = await repository.findById(id);
      if (!row) throw new HttpError(404, 'Año escolar no encontrado.');
      return publicYear(row);
    },
  };
}
