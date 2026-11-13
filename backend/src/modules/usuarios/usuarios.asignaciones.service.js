import { HttpError } from '../../shared/http-error.js';
import { unauthorized } from '../auth/auth.errors.js';
import { peruDate } from '../../shared/peru-date.js';
import { createUsuariosService } from './usuarios.service.js';
import { createAssignmentsRepository } from './usuarios.asignaciones.repository.js';
import { validateAssignmentQuery, validateNewAssignment } from './usuarios.asignaciones.validation.js';

function active(user) { return user && (user.activo === 1 || user.activo === true); }
function authorizeAdmin(actor) {
  if (!active(actor)) throw unauthorized();
  if (actor.rol !== 'ADMIN') throw new HttpError(403, 'Solo ADMIN puede crear asignaciones.');
}
function authorizeTarget(user) {
  if (!user) throw new HttpError(404, 'Usuario destinatario no encontrado.');
  if (!active(user) || user.rol !== 'REGISTRADOR') {
    throw new HttpError(409, 'El destinatario debe ser un REGISTRADOR activo.');
  }
}
function validateContext({ target, section, year, assignments }, data) {
  if (!section) throw new HttpError(404, 'Sección no encontrada.');
  if (!year) throw new HttpError(404, 'Año escolar no encontrado.');
  if (!(section.activo === 1 || section.activo === true)) throw new HttpError(409, 'La sección está inactiva.');
  if (!['PLANIFICADO', 'ABIERTO'].includes(year.estado)) throw new HttpError(409, 'El año escolar no permite nuevas asignaciones.');
  if (target.nivel_asignado !== null && target.nivel_asignado !== section.nivel) {
    throw new HttpError(409, 'El nivel del REGISTRADOR no coincide con el de la sección.');
  }
  if (data.fecha_inicio < year.fecha_inicio || data.fecha_inicio > year.fecha_fin
    || (data.fecha_fin !== null && data.fecha_fin > year.fecha_fin)) {
    throw new HttpError(400, 'Las fechas explícitas deben estar dentro del año escolar de la sección.');
  }
  if (assignments.some(row => row.fecha_inicio <= (data.fecha_fin ?? '9999-12-31')
    && (row.fecha_fin === null || row.fecha_fin >= data.fecha_inicio))) {
    throw new HttpError(409, 'Existe una asignación superpuesta del mismo usuario y sección.');
  }
}
export function createAssignmentsService({ repository = createAssignmentsRepository(), usuariosService = createUsuariosService(),
  seccionesService, getToday = peruDate } = {}) {
  if (!seccionesService) throw new Error('La composición debe proporcionar el servicio de secciones.');
  return {
    async list(query, actor) {
      if (!actor || (Object.hasOwn(actor, 'activo') && !active(actor))) throw unauthorized();
      const { filters, page, limit, offset } = validateAssignmentQuery(query);
      let access;
      if (actor.rol === 'ADMIN') access = {};
      else if (actor.rol === 'SUBDIRECCION') {
        const levels = await usuariosService.supervisionLevels(actor);
        if (filters.nivel !== undefined && !levels.includes(filters.nivel)) {
          throw new HttpError(403, 'No tienes permiso para consultar ese nivel.');
        }
        access = { levels };
      } else if (actor.rol === 'REGISTRADOR') access = { userId: String(actor.id) };
      else throw new HttpError(403, 'No tienes permiso para consultar asignaciones.');
      const rows = await repository.list({ filters, access, today: getToday(), limit: limit + 1, offset });
      return { asignaciones: rows.slice(0, limit), pagination: { page, limit, has_more: rows.length > limit } };
    },
    async create(body, actor) {
      if (!actor || (Object.hasOwn(actor, 'activo') && !active(actor))) throw unauthorized();
      if (actor.rol !== 'ADMIN') throw new HttpError(403, 'Solo ADMIN puede crear asignaciones.');
      const data = validateNewAssignment(body);
      try {
        return await repository.create(data, actor.id, { authorizeActor: authorizeAdmin, authorizeTarget,
          sectionContext: (id, connection) => seccionesService.assignmentContext(id, connection),
          decide: context => validateContext(context, data) });
      } catch (error) {
        if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
          throw new HttpError(409, 'Conflicto de asignación o concurrencia.');
        }
        throw error;
      }
    },
  };
}
