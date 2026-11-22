import { HttpError } from '../../../shared/http-error.js';
import { validateId } from '../../../shared/query-validation.js';
import { peruDate } from '../../../shared/peru-date.js';
import { unauthorized } from '../../auth/auth.errors.js';
import { createUsuariosService } from '../../usuarios/usuarios.service.js';
import { createSeccionesRepository } from './repository.js';
import { validateNewSection, validateSectionQuery, validateSectionPatch, validateSectionBatch } from './validation.js';

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
  async function createSections(body, actor, multiple = false) {
    const onlySubdirection = current => {
      if (current?.rol !== 'SUBDIRECCION') throw new HttpError(403, 'Solo Subdirección puede crear varias secciones.');
    };
    if (multiple) onlySubdirection(actor);
    const data = multiple ? validateSectionBatch(body) : validateNewSection(body);
    const level = multiple ? data[0].nivel : data.nivel;
    if (!actor || !['ADMIN', 'SUBDIRECCION'].includes(actor.rol)) {
      throw new HttpError(403, 'No tienes permiso para crear secciones.');
    }
    try {
      const write = multiple ? repository.createBatch.bind(repository) : repository.create.bind(repository);
      const result = await write(data, actor.id, async (current, year, connection) => {
        if (!current || !(current.activo === 1 || current.activo === true)) throw unauthorized();
        if (multiple) onlySubdirection(current);
        await authorize(current, level, connection);
        if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
        if (year.estado === 'CERRADO') throw new HttpError(409, 'El año escolar está cerrado.');
      });
      return multiple ? result.map(publicSection) : publicSection(result);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, multiple
        ? 'Una sección del lote ya está registrada. No se creó ninguna sección del lote.' : 'La sección ya está registrada.');
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
        throw new HttpError(409, 'Conflicto concurrente: vuelve a intentar la operación.');
      }
      throw error;
    }
  }
  return {
    async update(id, body, actor) {
      validateId(id);
      const data = validateSectionPatch(body);
      if (!actor || !['ADMIN', 'SUBDIRECCION'].includes(actor.rol)) {
        throw new HttpError(403, 'No tienes permiso para administrar secciones.');
      }
      try {
        const row = await repository.update(id, actor.id, async (current, year, section, connection) => {
          if (!current || !(current.activo === 1 || current.activo === true)) throw unauthorized();
          await authorize(current, section?.nivel, connection);
          if (!section || !year) throw new HttpError(404, 'Sección no encontrada.');
          if (year.estado === 'CERRADO') throw new HttpError(409, 'El año escolar está cerrado.');
          validateSectionPatch(data, section.nivel);
          const before = publicSection(section), after = { ...before, ...data.cambios };
          if (Object.keys(data.esperado).some(key => data.esperado[key] !== before[key])) {
            throw new HttpError(409, 'La sección cambió. Actualiza las secciones antes de volver a editar.');
          }
          if (Object.keys(data.cambios).every(key => after[key] === before[key])) return null;
          return { before, after, check({ enrollments, assignments, sessions, today }) {
            if ((before.grado !== after.grado || before.letra !== after.letra)
              && (enrollments.length || assignments.length || sessions.length)) {
              throw new HttpError(409, 'No se puede cambiar grado o nombre: la sección tiene referencias académicas.');
            }
            const ongoing = enrollments.some(row => (!row.fecha_fin || row.fecha_fin >= today)
              && (!row.fecha_retiro || row.fecha_retiro >= today));
            if (before.activo && !after.activo && (ongoing
              || assignments.some(row => !row.fecha_fin || row.fecha_fin >= today))) {
              throw new HttpError(409, 'No se puede desactivar: existen matrículas o asignaciones vigentes o futuras.');
            }
          } };
        }, getToday);
        return publicSection(row);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'La sección ya está registrada.');
        if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
          throw new HttpError(409, 'Conflicto concurrente: actualiza las secciones y vuelve a intentar.');
        }
        throw error;
      }
    },
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
    create: (body, actor) => createSections(body, actor),
    createBatch: (body, actor) => createSections(body, actor, true),
  };
}
