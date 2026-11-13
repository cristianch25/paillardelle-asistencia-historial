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

export function createApp({ authService = createAuthService(), usuariosService, aniosEscolaresService,
  seccionesService, calendarService, assignmentsService } = {}) {
  const app = express();
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', createAuthRoutes(authService));
  app.use('/api/usuarios', createUsuariosRoutes(authService, usuariosService));
  app.use('/api/anios-escolares', createAniosEscolaresRoutes(authService, aniosEscolaresService));
  const sections = seccionesService ?? createSeccionesService();
  app.use('/api/secciones', createSeccionesRoutes(authService, sections));
  app.use('/api/asignaciones', createAssignmentsRoutes(authService,
    assignmentsService ?? createAssignmentsService({ seccionesService: sections })));
  const calendar = createCalendarRoutes(authService, calendarService);
  app.use('/api/periodos-lectivos', calendar.periods);
  app.use('/api/calendario-lectivo', calendar.calendar);
  app.use(errorHandler);
  return app;
}

export default createApp();
