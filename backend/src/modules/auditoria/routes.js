import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireAdmin } from '../../middlewares/require-admin.js';
import { createAuditController } from './controller.js';
import { createAdministrativeAuditService } from './service.js';

export function createAuditRoutes(authService, service = createAdministrativeAuditService()) {
  const router = Router();
  const controller = createAuditController(service);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate(authService), requireAdmin);

  router.get('/', controller.list);

  return router;
}
