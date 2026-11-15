import { HttpError } from '../../../shared/http-error.js';
import { validateId } from '../../../shared/query-validation.js';
import { peruDate } from '../../../shared/peru-date.js';
import { unauthorized } from '../../auth/auth.errors.js';
import { createUsuariosService } from '../../usuarios/usuarios.service.js';
import { createSeccionesRepository } from './repository.js';
import { validateNewSection, validateSectionQuery } from './validation.js';

function publicSection(row) {
  return { id: String(row.id), anio_escolar_id: String(row.anio_escolar_id), nivel: row.nivel,
    grado: row.grado, letra: row.letra, turno: row.turno, activo: Boolean(row.activo) };
}
export function createSeccionesService({ repository = createSeccionesRepository(),
  usuariosService = createUsuariosService(), getToday = peruDate } = {}) {
  async function authorize(actor, level, connection) {
    if (!actor) throw unauthorized();
    if (actor.rol === 'ADMIN') return [];
    if (actor.rol === 'SUBDIRECCION') {
      const levels = await usuariosService.supervisionLevels(actor, connection);
      if (levels.length && (level === undefined || levels.includes(level))) return levels;
    }
    if (!connection && actor.rol === 'REGISTRADOR') return [];
    throw new HttpError(403, 'No tienes permiso para esta operación o nivel.');
  }
  async function scope(actor, level) {
    const levels = await authorize(actor, level);
    if (actor.rol === 'SUBDIRECCION') return { levels };
    if (actor.rol === 'REGISTRADOR') {
      return { ids: await usuariosService.currentSectionIds(actor.id, getToday()) };
    }
    return {};
  }
  return {
    async matchForImport(records, yearId, level, actor) {
      validateId(yearId);
      const access = await scope(actor, level);
      return repository.matchForImport(records, yearId, level, access);
    },
    // Operación interna para asignaciones: usa la conexión ya transaccional del llamador.
    async assignmentContext(id, connection) {
      validateId(id);
      return repository.assignmentContext(id, connection);
    },
    async list(query, actor) {
      const { page, limit, offset, filters } = validateSectionQuery(query);
      const access = await scope(actor, filters.nivel);
      const rows = await repository.list({ filters, access, limit: limit + 1, offset });
      return { secciones: rows.slice(0, limit).map(publicSection),
        pagination: { page, limit, has_more: rows.length > limit } };
    },
    async findById(id, actor) {
      validateId(id);
      const row = await repository.findById(id, await scope(actor));
      if (!row) throw new HttpError(404, 'Sección no encontrada.');
      return publicSection(row);
    },
    async create(body, actor) {
      const data = validateNewSection(body);
      if (!actor || !['ADMIN', 'SUBDIRECCION'].includes(actor.rol)) {
        throw new HttpError(403, 'No tienes permiso para crear secciones.');
      }
      try {
        const row = await repository.create(data, actor.id, async (current, year, connection) => {
          if (!current || !(current.activo === 1 || current.activo === true)) throw unauthorized();
          await authorize(current, data.nivel, connection);
          if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
          if (year.estado === 'CERRADO') throw new HttpError(409, 'El año escolar está cerrado.');
        });
        return publicSection(row);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'La sección ya está registrada.');
        if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
          throw new HttpError(409, 'Conflicto concurrente: vuelve a intentar la operación.');
        }
        throw error;
      }
    },
  };
}
