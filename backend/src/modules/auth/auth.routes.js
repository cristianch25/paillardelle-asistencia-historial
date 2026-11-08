import { Router, json } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { createAuthController } from './auth.controller.js';
import { createAuthService } from './auth.service.js';

export function createAuthRoutes(service = createAuthService()) {
  const router = Router();
  const controller = createAuthController(service);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/login', json({ limit: '8kb' }), controller.login);
  router.get('/me', authenticate(service), controller.me);

  return router;
}
