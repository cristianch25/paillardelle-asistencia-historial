import { HttpError } from '../../../shared/http-error.js';
import { validateId, validatePagination } from '../../../shared/query-validation.js';
import { createAniosEscolaresRepository } from './repository.js';
import { validateNewYear, validateYearTransition } from './validation.js';
import { unauthorized } from '../../auth/auth.errors.js';
import { peruDate } from '../../../shared/peru-date.js';

function authorizeAdmin(actor) {
  if (!actor || !(actor.activo === 1 || actor.activo === true)) throw unauthorized();
  if (actor.rol !== 'ADMIN') throw new HttpError(403, 'Acceso reservado a ADMIN.');
}
function concurrentConflict(error) {
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
    return new HttpError(409, 'Conflicto concurrente: vuelve a intentar la operación.');
  }
  return error;
}

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

export function createAniosEscolaresService({ repository = createAniosEscolaresRepository(), now = () => new Date() } = {}) {
  return {
    async close(id, body, actorId) {
      validateId(id);
      validateYearTransition(body, 'cierre');
      try {
        return publicYear(await repository.close(id, actorId, authorizeAdmin, year => {
          if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
          if (year.estado !== 'ABIERTO') throw new HttpError(409, 'Solo puede cerrarse un año ABIERTO.');
          if (peruDate(now()) <= year.fecha_fin) {
            throw new HttpError(409, 'El cierre solo está permitido después de la fecha de finalización, según la fecha de Lima.');
          }
        }));
      } catch (error) { throw concurrentConflict(error); }
    },
    async open(id, body, actorId) {
      validateId(id);
      validateYearTransition(body, 'apertura');
      try {
        return publicYear(await repository.open(id, actorId, authorizeAdmin, year => {
          if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
          if (year.estado !== 'PLANIFICADO') throw new HttpError(409, 'Solo puede abrirse un año PLANIFICADO.');
        }));
      } catch (error) { throw concurrentConflict(error); }
    },
    async create(body, actorId) {
      const data = validateNewYear(body);
      try {
        const row = await repository.create(data, actorId, authorizeAdmin);
        return publicYear(row);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'El año escolar ya está registrado.');
        throw concurrentConflict(error);
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
