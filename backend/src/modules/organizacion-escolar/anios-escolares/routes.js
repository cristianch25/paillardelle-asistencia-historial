import { Router, json } from 'express';
import { requireAdmin } from '../../../middlewares/require-admin.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { HttpError } from '../../../shared/http-error.js';
import { createAniosEscolaresController } from './controller.js';
import { createAniosEscolaresService } from './service.js';

export function createAniosEscolaresRoutes(authService, service = createAniosEscolaresService()) {
  const router = Router();
  const controller = createAniosEscolaresController(service);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate(authService), (req, _res, next) => {
    if (!['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'].includes(req.authUser.rol)) {
      throw new HttpError(403, 'Rol no autorizado para consultar años escolares.');
    }
    next();
  });
  router.post('/', requireAdmin, json({ limit: '8kb' }), controller.create);
  router.patch('/:id/abrir', requireAdmin, json({ limit: '8kb' }), controller.open);
  router.patch('/:id/cerrar', requireAdmin, json({ limit: '8kb' }), controller.close);
  router.get('/', controller.list);
  router.get('/:id', controller.findById);
  return router;
}
