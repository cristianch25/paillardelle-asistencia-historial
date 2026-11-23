import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { publicUser } from '../usuarios/usuarios.service.js';
import { hashPassword, isValidPassword } from '../../shared/passwords.js';
import { AuthError, unauthorized } from './auth.errors.js';
import { createLoginLimit } from './auth.login-limit.js';

export function createLogin({ repository, tokens, limit = createLoginLimit() }) {
  let dummyHash;
  return async (credentials, origin = 'unknown') => {
    const { usuario, password } = credentials ?? {};
    if (typeof usuario !== 'string' || usuario.trim().length === 0
      || Array.from(usuario).length > 60 || !isValidPassword(password)) {
      throw new AuthError(400, 'Envía usuario y password válidos; password admite hasta 72 bytes UTF-8.');
    }
    tokens.assertConfigured();
    const finish = limit.begin(usuario, origin);
    try {
      const user = await repository.findByUsername(usuario);
      // Igual trabajo para cuentas inexistentes, sin guardar nada en BD.
      dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
      const fallback = await dummyHash;
      const hash = typeof user?.password_hash === 'string' ? user.password_hash : fallback;
      const matches = await bcrypt.compare(password, hash);
      if (!user || !matches || !(user.activo === 1 || user.activo === true)) {
        const feedback = finish('failed');
        const error = feedback.retryAfter > 0
          ? new AuthError(429, 'Demasiados intentos. Inténtalo nuevamente cuando termine la espera') : unauthorized();
        error.code = feedback.retryAfter > 0 ? 'LOGIN_RATE_LIMIT' : 'LOGIN_FAILED';
        Object.assign(error, feedback);
        throw error;
      }
      finish('success');
      return { ...tokens.issue(user.id), user: publicUser(user) };
    } finally { finish('cancelled'); }
  };
}
