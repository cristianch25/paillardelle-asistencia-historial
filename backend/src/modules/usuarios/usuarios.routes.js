import { Router, json } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireAdmin } from '../../middlewares/require-admin.js';
import { createUsuariosController } from './usuarios.controller.js';
import { createUsuariosService } from './usuarios.service.js';

export function createUsuariosRoutes(authService, service = createUsuariosService()) {
  const router = Router();
  const controller = createUsuariosController(service);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate(authService), requireAdmin);
  router.post('/', json({ limit: '8kb' }), controller.create);
  router.get('/:id/niveles-adicionales', controller.getAdditionalLevels);
  router.put('/:id/niveles-adicionales', json({ limit: '8kb' }), controller.updateAdditionalLevels);
  router.patch('/:id/estado', json({ limit: '8kb' }), controller.setState);
  router.patch('/:id', json({ limit: '8kb' }), controller.update);
  router.get('/', controller.list);
  router.get('/:id', controller.findById);

  return router;
}
