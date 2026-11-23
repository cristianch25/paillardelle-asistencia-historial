// Gestiona matrículas y padrones por fecha, respetando permisos y vigencias.
import { HttpError } from '../../shared/http-error.js';
import { peruDate } from '../../shared/peru-date.js';
import { validateId } from '../../shared/query-validation.js';
import { createEnrollmentRepository } from './repository.js';
import { listQuery, enrollmentData, padronQuery, withdrawData, sectionChangeData, reingresoData } from './validation.js';
import { requireActor, enrollmentContext, enrollmentConflict, withdrawContext, validateWithdrawal } from './access.js';
import { createAttendanceImpactService } from '../asistencias/impact.service.js';

export function createEnrollmentService({ repository = createEnrollmentRepository(), usuariosService,
  seccionesService, identitiesService, getToday = peruDate, attendanceImpact = createAttendanceImpactService() } = {}) {
  if (!usuariosService || !seccionesService || !identitiesService) throw new Error('Falta composición de servicios.');
  async function accessFor(actor, date, connection, writing = false) {
    requireActor(actor, writing, Boolean(connection));
    if (actor.rol === 'ADMIN') return {};
    if (actor.rol === 'SUBDIRECCION') {
      let levels = await usuariosService.supervisionLevels(actor, connection);
      // En matrículas, SUBDIRECCION de SECUNDARIA solo opera en su propio nivel.
      if (actor.nivel_asignado === 'SECUNDARIA') levels = levels.filter(level => level === 'SECUNDARIA');
      return { levels };
    }
    return { ids: await usuariosService.historicalSectionIds(actor.id, date, getToday()) };
  }
  async function visibleIds(access, connection, filters = {}) {
    return repository.studentIds({ filters, access, date: getToday() }, connection);
  }
  async function create(body, actor, joint, connection) {
    requireActor(actor, true);
    const data = enrollmentData(body, joint);
    try {
      return await repository.create(data, actor.id, {
        authorize: (current, connection) => accessFor(current, getToday(), connection, true),
        sectionContext: (id, connection) => seccionesService.assignmentContext(id, connection),
        validateContext: (context, access) => enrollmentContext(context, data, access),
        beforeInsert: connection => attendanceImpact.assertInitialEnrollment(connection, data),
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
      }, connection);
    } catch (error) { throw enrollmentConflict(error); }
  }
  return {
    // Interno: asistencia autoriza al actor y comparte su instantánea de solo lectura.
    searchForAttendance: (data, access, connection) => repository.searchForAttendance(data, access, connection),
    // Interno: autorización y año ya bloqueados por asistencia; lecturas actuales.
    async rosterForAttendance(yearId, sectionId, date, connection) {
      const rows = await repository.list({ filters: { anio_escolar_id: yearId }, access: {}, date }, connection, true);
      const selected = rows.filter(row => row.seccion_id === sectionId);
      const counts = new Map();
      for (const row of rows) counts.set(row.estudiante_id, (counts.get(row.estudiante_id) ?? 0) + 1);
      if (!selected.length || selected.some(row => counts.get(row.estudiante_id) !== 1)) {
        throw new HttpError(409, 'Se requiere un padrón no vacío y sin vínculos ambiguos.');
      }
      return selected;
    },
    async importContext(ids, yearId, actor, connection, date = getToday()) {
      requireActor(actor, true);
      const access = await accessFor(actor, getToday(), connection, Boolean(connection));
      const visible = actor.rol === 'ADMIN' ? ids : [...new Set([
        ...await visibleIds(access, connection),
        ...await repository.studentIds({ filters: {}, access, date }, connection),
      ])];
      const selected = ids.filter(id => visible.includes(id));
      return { access, visibleIds: visible, enrollments: await repository.inspectForImport(selected, yearId) };
    },
    create: (body, actor) => create(body, actor, false),
    createJoint: (body, actor) => create(body, actor, true),
    createInTransaction: (body, actor, joint, connection) => create(body, actor, joint, connection),
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
    // La consulta exige vigencias de asignación y matrícula, sin exigir un día lectivo.
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
    async withdraw(id, body, actor) {
      validateId(id);
      requireActor(actor, true);
      const data = withdrawData(body), today = getToday();
      if (data.fecha_retiro > today) throw new HttpError(400, 'La fecha de retiro no puede ser futura.');
      try {
        return await repository.withdraw(id, data, actor.id, {
          authorize: (current, connection) => accessFor(current, today, connection, true),
          sectionContext: (sectionId, connection) => seccionesService.assignmentContext(sectionId, connection),
          validateSectionContext: withdrawContext,
          validateWithdrawal,
        });
      } catch (error) { throw enrollmentConflict(error); }
    },
    async changeSection(id, body, actor) {
      validateId(id);
      requireActor(actor, true);
      const data = sectionChangeData(body), today = getToday();
      if (data.fecha_efectiva > today) throw new HttpError(400, 'La fecha de cambio de sección no puede ser futura.');
      try {
        return await repository.changeSection(id, data, actor.id, {
          authorize: (current, connection) => accessFor(current, today, connection, true),
          sectionContext: (sectionId, connection) => seccionesService.assignmentContext(sectionId, connection),
          validateDestination: (connection, yearId) => attendanceImpact.assertSectionEntry(connection,
            { seccion_id: data.seccion_id, anio_escolar_id: yearId, fecha_inicio: data.fecha_efectiva }),
        });
      } catch (error) { throw enrollmentConflict(error); }
    },
    async retiredList(sectionId, actor) {
      validateId(sectionId);
      requireActor(actor, false);
      if (!['ADMIN', 'SUBDIRECCION'].includes(actor.rol)) throw new HttpError(403, 'Solo ADMIN y SUBDIRECCION pueden consultar estudiantes retirados.');
      const section = await seccionesService.findById(sectionId, actor), access = await accessFor(actor, getToday());
      if (access.levels && !access.levels.includes(section.nivel)) throw new HttpError(404, 'Sección no encontrada.');
      const rows = await repository.listRetired(sectionId, section.anio_escolar_id);
      const students = await identitiesService.readIdentities(rows.map(row => row.estudiante_id));
      const byId = new Map(students.map(student => [student.id, student]));
      return { seccion_id: sectionId, retirados: rows.map(row => ({ ...row, estudiante: byId.get(row.estudiante_id) })) };
    },
    async reingreso(id, body, actor) {
      validateId(id);
      requireActor(actor, true);
      const data = reingresoData(body), today = getToday();
      if (data.fecha_reingreso > today) throw new HttpError(400, 'La fecha de reingreso no puede ser futura.');
      try {
        return await repository.reingreso(id, data, actor.id, {
          authorize: (current, connection) => accessFor(current, today, connection, true),
          validateDestination: (connection, yearId) => attendanceImpact.assertSectionEntry(connection,
            { seccion_id: data.seccion_id, anio_escolar_id: yearId, fecha_inicio: data.fecha_reingreso }),
        });
      } catch (error) { throw enrollmentConflict(error); }
    },
  };
}
