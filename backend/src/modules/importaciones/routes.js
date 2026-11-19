import { Router, json } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireActor } from '../matriculas/access.js';
import { createImportPreviewService } from './preview.service.js';
import { createImportPreviewController } from './controller.js';

export function createImportPreviewRoutes(auth, service = createImportPreviewService()) {
  const router = Router(), controller = createImportPreviewController(service);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(auth), (req, _res, next) => { requireActor(req.authUser, true); next(); });
  router.get('/niveles', controller.levels);
  router.post('/vistas-previas/:id/confirmacion', json({ limit: '256kb' }), controller.confirm);
  router.get('/confirmaciones/:clave_operacion', controller.status);
  router.post('/vistas-previas', controller.load);
  router.get('/vistas-previas/:id', controller.get);
  // Selección efímera en memoria; no confirma ni escribe datos académicos.
  router.post('/vistas-previas/:id/seleccion', json({ limit: '32kb' }), controller.select);
  router.patch('/vistas-previas/:id/filas/:fila_id/contacto', json({ limit: '2kb' }), controller.correctPhone);
  return router;
}
