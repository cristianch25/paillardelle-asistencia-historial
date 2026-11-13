import { Router, json } from 'express';
import { authenticate } from '../../../middlewares/authenticate.js';
import { HttpError } from '../../../shared/http-error.js';
import { createCalendarController } from './controller.js';
import { createCalendarService } from './service.js';

function roleGuard(write = false) {
  return (req, _res, next) => {
    const roles = write ? ['ADMIN', 'SUBDIRECCION'] : ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'];
    if (!roles.includes(req.authUser.rol)) throw new HttpError(403, 'No tienes permiso para esta operación.');
    next();
  };
}
export function createCalendarRoutes(authService, service = createCalendarService()) {
  const periods = Router(), calendar = Router();
  const controller = createCalendarController(service);
  for (const router of [periods, calendar]) {
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.use(authenticate(authService), roleGuard());
  }
  const write = [roleGuard(true), json({ limit: '8kb' })];
  periods.get('/', controller.listPeriods);
  periods.get('/:id', controller.findPeriod);
  periods.post('/', ...write, controller.createPeriod);
  periods.patch('/:id', ...write, controller.updatePeriod);
  calendar.get('/', controller.effectiveCalendar);
  calendar.get('/excepciones', controller.listExceptions);
  calendar.put('/excepciones/:anio_escolar_id/:nivel/:fecha', ...write, controller.putException);
  calendar.post('/excepciones/rango', ...write, controller.blockRange);
  return { periods, calendar };
}
