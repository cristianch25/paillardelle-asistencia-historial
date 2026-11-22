import { Router, json } from 'express';
import { authenticate } from '../../../middlewares/authenticate.js';
import { HttpError } from '../../../shared/http-error.js';
import { createSeccionesController } from './controller.js';
import { createSeccionesService } from './service.js';

export function createSeccionesRoutes(authService, service = createSeccionesService()) {
  const router = Router();
  const controller = createSeccionesController(service);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(authService));
  router.post('/lote', (req, _res, next) => {
    if (req.authUser.rol !== 'SUBDIRECCION') throw new HttpError(403, 'Solo Subdirección puede crear varias secciones.');
    next();
  }, json({ limit: '2kb' }), controller.createBatch);
  router.get('/', controller.list);
  router.get('/:id', controller.findById);
  router.patch('/:id', (req, _res, next) => {
    if (!['ADMIN', 'SUBDIRECCION'].includes(req.authUser.rol)) {
      throw new HttpError(403, 'No tienes permiso para administrar secciones.');
    }
    next();
  }, json({ limit: '8kb' }), controller.update);
  router.post('/', (req, _res, next) => {
    if (!['ADMIN', 'SUBDIRECCION'].includes(req.authUser.rol)) {
      throw new HttpError(403, 'No tienes permiso para crear secciones.');
    }
    next();
  }, json({ limit: '8kb' }), controller.create);
  return router;
}
