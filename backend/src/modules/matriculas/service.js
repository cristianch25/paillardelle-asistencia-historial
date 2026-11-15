import { HttpError } from '../../shared/http-error.js';
import { peruDate } from '../../shared/peru-date.js';
import { createEnrollmentRepository } from './repository.js';
import { listQuery, enrollmentData, padronQuery } from './validation.js';
import { requireActor, enrollmentContext, enrollmentConflict } from './access.js';

export function createEnrollmentService({ repository = createEnrollmentRepository(), usuariosService,
  seccionesService, identitiesService, getToday = peruDate } = {}) {
  if (!usuariosService || !seccionesService || !identitiesService) throw new Error('Falta composición de servicios.');
  async function accessFor(actor, date, connection, writing = false) {
    requireActor(actor, writing, Boolean(connection));
    if (actor.rol === 'ADMIN') return {};
    if (actor.rol === 'SUBDIRECCION') {
      let levels = await usuariosService.supervisionLevels(actor, connection);
      // Decisión de esta etapa: Secundaria solo opera su propio nivel.
      if (actor.nivel_asignado === 'SECUNDARIA') levels = levels.filter(level => level === 'SECUNDARIA');
      return { levels };
    }
    return { ids: await usuariosService.historicalSectionIds(actor.id, date, getToday()) };
  }
  async function visibleIds(access, connection, filters = {}) {
    return repository.studentIds({ filters, access, date: getToday() }, connection);
  }
  async function create(body, actor, joint) {
    requireActor(actor, true);
    const data = enrollmentData(body, joint);
    try {
      return await repository.create(data, actor.id, {
        authorize: (current, connection) => accessFor(current, getToday(), connection, true),
        sectionContext: (id, connection) => seccionesService.assignmentContext(id, connection),
        validateContext: (context, access) => enrollmentContext(context, data, access),
        async identity(connection, access) {
          if (joint) {
            const ids = access.levels ? await visibleIds(access, connection) : undefined;
            return identitiesService.insertIdentity(data.estudiante, actor.id, connection, ids);
          }
          const estudiante = await identitiesService.lockIdentity(data.estudiante_id, connection);
          if (access.levels && !(await visibleIds(access, connection, { estudiante_id: estudiante.id })).length) {
            throw new HttpError(404, 'Estudiante no encontrado.');
          }
          return { estudiante, advertencias: [] };
        },
        checkExisting(existing) {
          if (existing.length) throw new HttpError(409, 'El estudiante ya tiene matrícula en ese año.');
        },
      });
    } catch (error) { throw enrollmentConflict(error); }
  }
  return {
    async importContext(ids, yearId, actor) {
      requireActor(actor, true);
      const access = await accessFor(actor, getToday());
      const visible = actor.rol === 'ADMIN' ? ids : await visibleIds(access);
      const selected = ids.filter(id => visible.includes(id));
      return { access, visibleIds: visible, enrollments: await repository.inspectForImport(selected, yearId) };
    },
    create: (body, actor) => create(body, actor, false),
    createJoint: (body, actor) => create(body, actor, true),
    async createStandalone(data, actor) {
      requireActor(actor, true);
      if (actor.rol !== 'ADMIN') throw new HttpError(403, 'Usa el alta conjunta con matrícula inicial.');
      try {
        return await repository.standalone(actor.id, async (current, connection) => {
          requireActor(current, true, true);
          if (current.rol !== 'ADMIN') throw new HttpError(403, 'Solo ADMIN crea identidades sin matrícula.');
          return identitiesService.insertIdentity(data, actor.id, connection);
        });
      } catch (error) { throw enrollmentConflict(error); }
    },
    async studentSelection(query, actor) {
      const { filters, page, limit, offset } = listQuery(query);
      const access = await accessFor(actor, filters.fecha ?? getToday());
      if (actor.rol === 'ADMIN' && !filters.fecha && !filters.seccion_id && !filters.anio_escolar_id) {
        return { estudiante_id: filters.estudiante_id, page, pageSize: limit, limit: limit + 1, offset };
      }
      const ids = await repository.studentIds({ filters, access, date: filters.fecha ?? getToday(), limit: limit + 1, offset });
      return { ids: ids.slice(0, limit), page, pageSize: limit, limit, offset: 0, hasMore: ids.length > limit };
    },
    async list(query, actor) {
      const { filters, page, limit, offset } = listQuery(query);
      const date = filters.fecha ?? getToday(), access = await accessFor(actor, date);
      const rows = await repository.list({ filters, access, date, limit: limit + 1, offset });
      return { matriculas: rows.slice(0, limit), pagination: { page, limit, has_more: rows.length > limit } };
    },
    async padron(id, query, actor) {
      const fecha = padronQuery(id, query), access = await accessFor(actor, fecha);
      const section = await seccionesService.findById(id, actor);
      if ((access.ids && !access.ids.includes(id)) || (access.levels && !access.levels.includes(section.nivel))) {
        throw new HttpError(404, 'Sección no encontrada.');
      }
      const rows = await repository.list({ filters: { seccion_id: id, anio_escolar_id: section.anio_escolar_id }, access, date: fecha });
      const students = await identitiesService.readIdentities(rows.map(row => row.estudiante_id));
      const byId = new Map(students.map(student => [student.id, student]));
      return { seccion: section, fecha, padron: rows.map(row => ({ ...row, estudiante: byId.get(row.estudiante_id) })) };
    },
  };
}
