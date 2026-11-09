import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { HttpError } from '../../shared/http-error.js';
import { createAniosEscolaresController } from './anios-escolares.controller.js';
import { createAniosEscolaresService } from './anios-escolares.service.js';

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
  router.get('/', controller.list);
  router.get('/:id', controller.findById);
  return router;
}
