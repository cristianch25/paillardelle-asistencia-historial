import { Router, json } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { createAttendanceController } from './controller.js';
import { createAttendanceService } from './service.js';

export function createAttendanceRoutes(authService, service = createAttendanceService()) {
  const router = Router(), controller = createAttendanceController(service);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(authService));
  router.get('/seguimiento-mensual', controller.monthlyFollowup);
  router.get('/estadisticas', controller.statistics);
  router.get('/busqueda-estudiantes', controller.searchStudents);
  router.get('/sesiones', controller.list);
  router.post('/sesiones', json({ limit: '8kb' }), controller.open);
  router.get('/sesiones/:id', controller.find);
  router.get('/sesiones/:id/resumen', controller.summary);
  router.patch('/sesiones/:id/registros', json({ limit: '512kb' }), controller.save);
  router.post('/sesiones/:id/cierre', json({ limit: '8kb' }), controller.close);
  router.get('/:asistenciaId/historial', controller.history);
  return router;
}
