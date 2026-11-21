import { unauthorized } from '../modules/auth/auth.errors.js';
import { assertPasswordChanged } from '../modules/auth/auth.access.js';

export function authenticate(service, { allowPasswordChange = false } = {}) {
  return async (req, _res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match) throw unauthorized();
    req.authUser = await service.authenticate(match[1]);
    if (!allowPasswordChange) assertPasswordChanged(req.authUser);
    next();
  };
}
