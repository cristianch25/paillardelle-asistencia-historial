import { randomBytes } from 'node:crypto';
import { publicUser } from '../usuarios/usuarios.service.js';
import bcrypt from 'bcrypt';
import { AuthError, unauthorized } from './auth.errors.js';
import { createAuthRepository } from './auth.repository.js';
import { createTokenService } from './auth.tokens.js';
import { hashPassword, isValidPassword } from '../../shared/passwords.js';

export function createAuthService({
  repository = createAuthRepository(), tokens = createTokenService(),
} = {}) {
  let dummyHash;

  return {
    async login(credentials) {
      const { usuario, password } = credentials ?? {};
      if (typeof usuario !== 'string' || usuario.trim().length === 0
        || Array.from(usuario).length > 60 || !isValidPassword(password)) {
        throw new AuthError(400, 'Envía usuario y password válidos; password admite hasta 72 bytes UTF-8.');
      }
      tokens.assertConfigured();
      const user = await repository.findByUsername(usuario);
      // También se ejecuta bcrypt para usuarios inexistentes, sin guardar nada en BD.
      dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
      const fallback = await dummyHash;
      const hash = typeof user?.password_hash === 'string' ? user.password_hash : fallback;
      const matches = await bcrypt.compare(password, hash);
      if (!user || !matches || !(user.activo === 1 || user.activo === true)) {
        throw unauthorized();
      }
      return { ...tokens.issue(user.id), user: publicUser(user) };
    },
    async authenticate(token) {
      const id = tokens.verify(token);
      const user = await repository.findById(id);
      if (!user || !(user.activo === 1 || user.activo === true)) throw unauthorized();
      return publicUser(user);
    },
  };
}
