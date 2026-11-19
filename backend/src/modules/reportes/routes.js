import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { createMonthlyReportService } from './service.js';
import { createReportsController } from './controller.js';

export function createReportsRoutes(authService, service = createMonthlyReportService()) {
  const router = Router(), controller = createReportsController(service);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(authService));
  router.get('/asistencia-mensual.pdf', controller.monthly);
  return router;
}
