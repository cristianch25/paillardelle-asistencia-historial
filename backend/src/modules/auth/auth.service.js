import { randomBytes } from 'node:crypto';
import { publicUser } from '../usuarios/usuarios.service.js';
import bcrypt from 'bcrypt';
import { AuthError, unauthorized } from './auth.errors.js';
import { createAuthRepository } from './auth.repository.js';
import { createTokenService } from './auth.tokens.js';
import { hashPassword, isValidPassword } from '../../shared/passwords.js';

function validateChangePasswordData(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AuthError(400, 'Datos de cambio de contraseña inválidos.');
  }
  const { password_actual, password_nueva, password_confirmacion } = body;
  if (typeof password_actual !== 'string' || password_actual.length === 0) {
    throw new AuthError(400, 'Ingresa tu contraseña actual.');
  }
  if (typeof password_nueva !== 'string' || password_nueva.length < 8) {
    throw new AuthError(400, 'La nueva contraseña debe tener como mínimo 8 caracteres.');
  }
  if (Buffer.byteLength(password_nueva, 'utf8') > 72) {
    throw new AuthError(400, 'La nueva contraseña supera el límite de 72 bytes UTF-8.');
  }
  if (password_nueva !== password_confirmacion) {
    throw new AuthError(400, 'Las contraseñas no coinciden.');
  }
  return { password_actual, password_nueva };
}

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
    async changePassword(userId, body) {
      if (!userId) throw unauthorized();
      const { password_actual, password_nueva } = validateChangePasswordData(body);
      await repository.changePassword(userId, async currentHash => {
        const matches = await bcrypt.compare(password_actual, currentHash);
        if (!matches) throw new AuthError(400, 'Contraseña actual incorrecta.');
        return hashPassword(password_nueva);
      });
      return { message: 'Contraseña cambiada correctamente.' };
    },
  };
}
