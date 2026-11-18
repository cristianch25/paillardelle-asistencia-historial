import { Router, json } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { HttpError } from '../../shared/http-error.js';
import { createStudentsController } from './controller.js';

export function createStudentsRoutes(authService, service) {
  const router = Router(), controller = createStudentsController(service);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(authService));
  router.post('/:id/apoderado/telefono/vista-previa', json({ limit: '2kb' }), controller.previewPhone);
  router.patch('/:id/apoderado/telefono', json({ limit: '2kb' }), controller.confirmPhone);
  router.get('/:id/perfil', controller.profile);
  router.get('/', controller.list);
  router.post('/', (req, _res, next) => {
    if (req.authUser.rol !== 'ADMIN') throw new HttpError(403, 'Usa el alta conjunta con matrícula inicial.');
    next();
  }, json({ limit: '8kb' }), controller.create);
  return router;
}
