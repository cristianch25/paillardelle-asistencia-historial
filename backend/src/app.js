import express from 'express';
import healthRoutes from './modules/health/health.routes.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createUsuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import { createAniosEscolaresRoutes } from './modules/organizacion-escolar/anios-escolares/routes.js';
import { errorHandler } from './middlewares/error-handler.js';
import { createSeccionesRoutes } from './modules/organizacion-escolar/secciones/routes.js';
import { createCalendarRoutes } from './modules/organizacion-escolar/calendario-lectivo/routes.js';
import { createAssignmentsRoutes } from './modules/usuarios/usuarios.asignaciones.routes.js';
import { createAssignmentsService } from './modules/usuarios/usuarios.asignaciones.service.js';
import { createSeccionesService } from './modules/organizacion-escolar/secciones/service.js';
import { createUsuariosService } from './modules/usuarios/usuarios.service.js';
import { createStudentIdentitiesService, createStudentsService } from './modules/estudiantes/service.js';
import { createStudentsRoutes } from './modules/estudiantes/routes.js';
import { createEnrollmentService } from './modules/matriculas/service.js';
import { createEnrollmentRoutes } from './modules/matriculas/routes.js';
import { createAttendanceRoutes } from './modules/asistencias/routes.js';
import { createImportPreviewRoutes } from './modules/importaciones/routes.js';
import { createReportsRoutes } from './modules/reportes/routes.js';
import { createAuditRoutes } from './modules/auditoria/routes.js';
import { createSecurityRoutes } from './modules/seguridad/routes.js';

export function createApp({ authService = createAuthService(), usuariosService, aniosEscolaresService,
  seccionesService, calendarService, assignmentsService, studentsService, matriculasService, attendanceService, importPreviewService, reportsService, auditService, securityService } = {}) {
  const app = express();
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', createAuthRoutes(authService));
  app.use('/api/usuarios', createUsuariosRoutes(authService, usuariosService));
  app.use('/api/auditoria', createAuditRoutes(authService, auditService));
  app.use('/api/seguridad', createSecurityRoutes(authService, securityService));
  app.use('/api/anios-escolares', createAniosEscolaresRoutes(authService, aniosEscolaresService));
  const sections = seccionesService ?? createSeccionesService();
  const enrollments = matriculasService ?? createEnrollmentService({
    usuariosService: usuariosService ?? createUsuariosService(), seccionesService: sections,
    identitiesService: createStudentIdentitiesService() });
  const students = studentsService ?? createStudentsService({ matriculasService: enrollments });
  const enrollmentRoutes = createEnrollmentRoutes(authService, enrollments);
  app.use('/api/estudiantes', createStudentsRoutes(authService, students));
  app.use('/api/matriculas', enrollmentRoutes.router);
  app.use('/api/secciones', enrollmentRoutes.padron);
  app.use('/api/secciones', createSeccionesRoutes(authService, sections));
  app.use('/api/asignaciones', createAssignmentsRoutes(authService,
    assignmentsService ?? createAssignmentsService({ seccionesService: sections })));
  const calendar = createCalendarRoutes(authService, calendarService);
  app.use('/api/periodos-lectivos', calendar.periods);
  app.use('/api/calendario-lectivo', calendar.calendar);
  app.use('/api/asistencias', createAttendanceRoutes(authService, attendanceService));
  app.use('/api/importaciones', createImportPreviewRoutes(authService, importPreviewService));
  app.use('/api/reportes', createReportsRoutes(authService, reportsService));
  app.use(errorHandler);
  return app;
}

export default createApp();
