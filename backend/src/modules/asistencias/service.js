import { HttpError } from '../../shared/http-error.js';
import { peruDate } from '../../shared/peru-date.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { createSeccionesService } from '../organizacion-escolar/secciones/service.js';
import { createCalendarService } from '../organizacion-escolar/calendario-lectivo/service.js';
import { createEnrollmentService } from '../matriculas/service.js';
import { createStudentIdentitiesService } from '../estudiantes/service.js';
import { createAdministrativeAuditService } from '../auditoria/service.js';
import { createAttendanceContext } from './context.repository.js';
import { createAttendanceReader } from './read.repository.js';
import { createAttendanceWriter } from './write.repository.js';
import { scopeFor, assertScope, assertWritable, assertVersion, planChanges, summary } from './rules.js';
import { opening, closing, changes, sessionInput } from './validation.js';
import { createAttendanceListService } from './list.service.js';
import { createAttendanceSearchService } from './search.service.js';
import { createAttendanceStatisticsService } from './statistics.service.js';
import { createMonthlyFollowupService } from './followup.service.js';
import { createAttendanceHistoryService } from './history.service.js';

export function createAttendanceService(options = {}) {
  const users = options.users ?? createUsuariosService();
  const sections = options.sections ?? createSeccionesService({ usuariosService: users });
  const calendar = options.calendar ?? createCalendarService({ usuariosService: users });
  const enrollments = options.enrollments ?? createEnrollmentService({ usuariosService: users,
    seccionesService: sections, identitiesService: createStudentIdentitiesService() });
  const repository = options.repository ?? createAttendanceContext();
  const reader = options.reader ?? createAttendanceReader(), writer = options.writer ?? createAttendanceWriter();
  const audit = options.audit ?? createAdministrativeAuditService(), today = options.getToday ?? peruDate;
  async function run(locator, actor, work) {
    // HTTP autentica y el repositorio revalida al actor tras adquirir su bloqueo.
    if (!actor) throw new HttpError(401, 'Autenticación requerida.');
    try {
      return await repository.transact(locator, actor.id, sections,
        (current, date, connection) => scopeFor(current, date, today(), users, connection), async context => {
          assertScope(context.section, context.access);
          return work(context);
        });
    } catch (error) {
      if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
        throw new HttpError(409, 'Conflicto de asistencia o concurrencia; consulta antes de reintentar.');
      }
      throw error;
    }
  }
  async function writable(context, creating = false) {
    const lective = await calendar.lectiveOn(context.connection, String(context.year.id), context.section.nivel, context.fecha);
    assertWritable(context, today(), lective, creating);
  }
  async function detail(context) {
    const rows = await reader.rows(context.connection, context.session.id);
    const latest = await reader.lastChanges(context.connection, context.session.id);
    return { sesion: context.session, padron: rows.map(row => ({ asistencia_id: row.id, matricula_id: row.matricula_id,
      matricula_seccion_id: row.matricula_seccion_id, estado: row.estado, version: row.version,
      justificada: row.justificada, motivo_justificacion: row.motivo_justificacion ?? null,
      estudiante: { id: row.estudiante_id, codigo_estudiante: row.codigo_estudiante, apellido_paterno: row.apellido_paterno,
        apellido_materno: row.apellido_materno, nombres: row.nombres }, ultimo_cambio: latest.get(row.id) ?? null })), resumen: summary(rows) };
  }
  return {
    ...createAttendanceStatisticsService({ repository: options.statisticsRepository, users }),
    ...createMonthlyFollowupService({ repository: options.followupRepository, users, getToday: today }),
    ...createAttendanceListService({ repository: options.listRepository, users, calendar, getToday: today }),
    ...createAttendanceSearchService({ repository: options.searchRepository, enrollments, users, getToday: today }),
    ...createAttendanceHistoryService({ repository: options.historyRepository }),
    async open(body, actor) {
      const location = opening(body);
      return run(location, actor, async context => {
        if (context.session) return { ...await detail(context), creada: false };
        await writable(context, true);
        const roster = await enrollments.rosterForAttendance(String(context.year.id), location.seccion_id, location.fecha, context.connection);
        context.session = await writer.open(context.connection, context, roster);
        await audit.session(context.connection, actor.id, 'ABRIR_SESION_ASISTENCIA', null,
          { ...context.session, padron: roster.map(row => ({ matricula_id: row.id, matricula_seccion_id: row.matricula_seccion_id })) });
        return { ...await detail(context), creada: true };
      });
    },
    async find(id, query, actor, onlySummary = false) {
      sessionInput(id, query);
      return run({ id }, actor, async context => {
        if (onlySummary) return { sesion_id: context.session.id, version: context.session.version,
          resumen: summary(await reader.rows(context.connection, context.session.id)) };
        return detail(context);
      });
    },
    async save(id, body, actor) {
      sessionInput(id); const data = changes(body);
      return run({ id }, actor, async context => {
        await writable(context);
        const rows = await reader.rows(context.connection, context.session.id);
        const plan = planChanges(context.session, rows, data);
        for (const change of plan.sort((a, b) => BigInt(a.before.id) < BigInt(b.before.id) ? -1 : 1)) {
          await writer.mark(context.connection, change, actor.id);
        }
        if (plan.length) context.session = await writer.advance(context.connection, context.session, actor.id);
        return detail(context);
      });
    },
    async close(id, body, actor) {
      sessionInput(id); const data = closing(body);
      return run({ id }, actor, async context => {
        await writable(context); assertVersion(context.session.version, data.version);
        if (context.session.estado !== 'CERRADA') {
          const before = context.session;
          context.session = await writer.advance(context.connection, before, actor.id, true);
          await audit.session(context.connection, actor.id, 'CERRAR_SESION_ASISTENCIA', before, context.session);
        }
        const result = await detail(context);
        return { ...result, advertencias: result.resumen.pendientes ? [{ codigo: 'PENDIENTES_AL_CERRAR', cantidad: result.resumen.pendientes }] : [] };
      });
    },
  };
}
