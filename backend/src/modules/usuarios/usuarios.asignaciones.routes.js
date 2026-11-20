import { Router, json } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireAdmin } from '../../middlewares/require-admin.js';
import { HttpError } from '../../shared/http-error.js';
import { createAssignmentsController } from './usuarios.asignaciones.controller.js';

export function createAssignmentsRoutes(authService, service) {
  const router = Router(), controller = createAssignmentsController(service);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(authService));
  router.get('/', (req, _res, next) => {
    if (!['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'].includes(req.authUser.rol)) {
      throw new HttpError(403, 'No tienes permiso para consultar asignaciones.');
    }
    next();
  }, controller.list);
  router.post('/', requireAdmin, json({ limit: '8kb' }), controller.create);
  router.patch('/:id/finalizar', requireAdmin, json({ limit: '8kb' }), controller.finalize);
  return router;
}
