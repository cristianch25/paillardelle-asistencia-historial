import { HttpError } from '../../shared/http-error.js';
import { validateId, validatePagination } from '../../shared/query-validation.js';
import { createAniosEscolaresRepository } from './anios-escolares.repository.js';
import { validateNewYear } from './anios-escolares.validation.js';
import { unauthorized } from '../auth/auth.errors.js';

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
    async create(body, actorId) {
      const data = validateNewYear(body);
      try {
        const row = await repository.create(data, actorId, actor => {
          if (!actor || !(actor.activo === 1 || actor.activo === true)) throw unauthorized();
          if (actor.rol !== 'ADMIN') throw new HttpError(403, 'Acceso reservado a ADMIN.');
        });
        return publicYear(row);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'El año escolar ya está registrado.');
        if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
          throw new HttpError(409, 'Conflicto concurrente: vuelve a intentar la operación.');
        }
        throw error;
      }
    },
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
