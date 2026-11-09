import express from 'express';
import healthRoutes from './modules/health/health.routes.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createUsuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import { createAniosEscolaresRoutes } from './modules/organizacion-escolar/anios-escolares.routes.js';
import { errorHandler } from './middlewares/error-handler.js';

export function createApp({ authService = createAuthService(), usuariosService, aniosEscolaresService } = {}) {
  const app = express();
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', createAuthRoutes(authService));
  app.use('/api/usuarios', createUsuariosRoutes(authService, usuariosService));
  app.use('/api/anios-escolares', createAniosEscolaresRoutes(authService, aniosEscolaresService));
  app.use(errorHandler);
  return app;
}

export default createApp();
