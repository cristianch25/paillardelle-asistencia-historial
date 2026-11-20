import { Router, json } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { HttpError } from '../../shared/http-error.js';
import { createEnrollmentController } from './controller.js';

export function createEnrollmentRoutes(authService, service) {
  const router = Router(), padron = Router(), controller = createEnrollmentController(service);
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  router.use(noStore, authenticate(authService));
  const writer = (req, _res, next) => {
    if (!['ADMIN', 'SUBDIRECCION'].includes(req.authUser.rol)) throw new HttpError(403, 'No puedes crear matrículas.');
    next();
  };
  router.get('/', controller.list);
  router.post('/', writer, json({ limit: '8kb' }), controller.create);
  router.post('/alta-inicial', writer, json({ limit: '8kb' }), controller.joint);
  router.patch('/:id/retiro', writer, json({ limit: '2kb' }), controller.withdraw);
  router.post('/:id/cambio-seccion', writer, json({ limit: '2kb' }), controller.changeSection);
  router.post('/:id/reingreso', writer, json({ limit: '2kb' }), controller.reingreso);
  padron.get('/:id/padron', noStore, authenticate(authService), controller.padron);
  padron.get('/:id/retirados', noStore, authenticate(authService), writer, controller.retiredList);
  return { router, padron };
}
