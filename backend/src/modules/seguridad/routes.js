import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { createAuditController } from '../auditoria/controller.js';
import { authorizeSecurityActor, createSecurityService } from './service.js';

export function createSecurityRoutes(authService, service = createSecurityService()) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(authService), (req, _res, next) => { authorizeSecurityActor(req.authUser); next(); });
  router.get('/', createAuditController(service).list);
  return router;
}
