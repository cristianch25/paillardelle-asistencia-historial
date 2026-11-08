import express from 'express';
import healthRoutes from './modules/health/health.routes.js';
import { createAuthRoutes } from './modules/auth/auth.routes.js';
import { errorHandler } from './middlewares/error-handler.js';

export function createApp({ authService } = {}) {
  const app = express();
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', createAuthRoutes(authService));
  app.use(errorHandler);
  return app;
}

export default createApp();
