import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { createCalendarService } from '../src/modules/organizacion-escolar/calendario-lectivo/service.js';
import { createCalendarRepository } from '../src/modules/organizacion-escolar/calendario-lectivo/repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createEnrollmentService } from '../src/modules/matriculas/service.js';
import { createEnrollmentRepository } from '../src/modules/matriculas/repository.js';
import { createStudentIdentitiesService, createStudentsService } from '../src/modules/estudiantes/service.js';
import { createStudentsRepository } from '../src/modules/estudiantes/repository.js';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { createAttendanceContext } from '../src/modules/asistencias/context.repository.js';
import { createAttendanceListRepository } from '../src/modules/asistencias/list.repository.js';
import { createAttendanceStatisticsRepository } from '../src/modules/asistencias/statistics.repository.js';
import { createMonthlyFollowupRepository } from '../src/modules/asistencias/followup.repository.js';
import { createAttendanceWriter } from '../src/modules/asistencias/write.repository.js';
import { createAdministrativeAuditService } from '../src/modules/auditoria/service.js';
import { createAdministrativeAuditRepository } from '../src/modules/auditoria/repository.js';
import { createAssignmentsService } from '../src/modules/usuarios/usuarios.asignaciones.service.js';
import { createAssignmentsRepository } from '../src/modules/usuarios/usuarios.asignaciones.repository.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares/service.js';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares/repository.js';

// Composición del backend real sobre una única instancia aislada, sin modificar .env.
export function attendanceMysqlApp(pool, options = {}) {
  const provider = () => pool;
  const users = createUsuariosService({ repository: createUsuariosRepository(provider),
    supervision: createSupervisionService({ repository: createSupervisionRepository(provider) }) });
  const sections = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService: users });
  const calendar = createCalendarService({ repository: createCalendarRepository(provider),
    writer: createCalendarWriter(provider), usuariosService: users });
  const studentRepository = createStudentsRepository(provider);
  const enrollments = createEnrollmentService({ repository: createEnrollmentRepository(provider),
    usuariosService: users, seccionesService: sections, identitiesService: createStudentIdentitiesService({ repository: studentRepository }) });
  const faults = { history: false, audit: false, commit: false };
  const writer = createAttendanceWriter(), auditRepository = createAdministrativeAuditRepository();
  // Fallos SQL reales dentro de la misma transacción; exclusivamente en la copia aislada.
  const faultWriter = { ...writer, async mark(connection, change, actorId) {
    await writer.mark(connection, change, actorId);
    if (faults.history) await connection.execute('INSERT INTO tabla_inexistente_prueba_004 VALUES (1)');
  } };
  const audit = createAdministrativeAuditService({ async append(connection, ...args) {
    await auditRepository.append(connection, ...args);
    if (faults.audit) await connection.execute('INSERT INTO tabla_inexistente_prueba_004 VALUES (1)');
  } });
  let destroyed = 0;
  const txPool = { async getConnection() {
    const connection = await pool.getConnection();
    return new Proxy(connection, { get(target, key) {
      if (key === 'commit' && faults.commit) return async () => { await target.commit(); throw new Error('Resultado COMMIT incierto de prueba'); };
      if (key === 'destroy') return () => { destroyed++; return target.destroy(); };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  const attendance = createAttendanceService({ repository: createAttendanceContext(() => txPool),
    users, sections, calendar, enrollments, writer: faultWriter, audit,
    listRepository: createAttendanceListRepository(provider), statisticsRepository: createAttendanceStatisticsRepository(provider),
    followupRepository: createMonthlyFollowupRepository(provider) });
  const app = createApp({ authService: options.authService ?? createAuthService({ repository: createAuthRepository(provider) }),
    aniosEscolaresService: createAniosEscolaresService({ repository: createAniosEscolaresRepository(provider) }),
    assignmentsService: createAssignmentsService({ repository: createAssignmentsRepository(provider), usuariosService: users, seccionesService: sections }),
    usuariosService: users, seccionesService: sections, calendarService: calendar, matriculasService: enrollments,
    studentsService: createStudentsService({ repository: studentRepository, matriculasService: enrollments }), attendanceService: attendance });
  return { app, faults, destroyed: () => destroyed };
}
