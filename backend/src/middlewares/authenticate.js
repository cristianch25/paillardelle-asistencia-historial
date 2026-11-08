import { unauthorized } from '../modules/auth/auth.errors.js';

export function authenticate(service) {
  return async (req, _res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match) throw unauthorized();
    req.authUser = await service.authenticate(match[1]);
    next();
  };
}
