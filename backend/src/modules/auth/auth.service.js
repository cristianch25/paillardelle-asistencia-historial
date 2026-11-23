import { publicUser } from '../usuarios/usuarios.service.js';
import bcrypt from 'bcrypt';
import { AuthError, unauthorized } from './auth.errors.js';
import { createAuthRepository } from './auth.repository.js';
import { createTokenService } from './auth.tokens.js';
import { hashPassword, isValidNewPassword } from '../../shared/passwords.js';
import { requiresPasswordChange, assertPasswordChanged } from './auth.access.js';
import { createLogin } from './auth.login.js';

function validateChangePasswordData(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AuthError(400, 'Datos de cambio de contraseña inválidos.');
  }
  const { password_actual, password_nueva, password_confirmacion } = body;
  if (typeof password_actual !== 'string' || password_actual.length === 0) {
    throw new AuthError(400, 'Ingresa tu contraseña actual.');
  }
  if (!isValidNewPassword(password_nueva)) {
    throw new AuthError(400, 'La nueva contraseña debe tener como mínimo 8 caracteres y hasta 72 bytes UTF-8.');
  }
  if (password_nueva !== password_confirmacion) {
    throw new AuthError(400, 'Las contraseñas no coinciden.');
  }
  return { password_actual, password_nueva };
}

export function createAuthService({
  repository = createAuthRepository(), tokens = createTokenService(), loginLimit,
} = {}) {
  return {
    login: createLogin({ repository, tokens, limit: loginLimit }),
    async authenticate(token) {
      const id = tokens.verify(token);
      const user = await repository.findById(id);
      if (!user || !(user.activo === 1 || user.activo === true)) throw unauthorized();
      return publicUser(user);
    },
    async renew(token) {
      const id = tokens.verify(token);
      const user = await repository.findById(id);
      if (!user || ![1, true].includes(user.activo)) throw unauthorized();
      if (!['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO'].includes(user.rol)) throw unauthorized();
      assertPasswordChanged(user);
      return { ...tokens.renew(token), user: publicUser(user) };
    },
    async changePassword(userId, body) {
      if (!userId) throw unauthorized();
      const { password_actual, password_nueva } = validateChangePasswordData(body);
      await repository.changePassword(userId, async (currentHash, user) => {
        const matches = await bcrypt.compare(password_actual, currentHash);
        if (!matches) throw new AuthError(400, 'Contraseña actual incorrecta.');
        if (requiresPasswordChange(user) && await bcrypt.compare(password_nueva, currentHash)) {
          throw new AuthError(400, 'La nueva contraseña debe ser distinta de la contraseña actual.');
        }
        return hashPassword(password_nueva);
      });
      return { message: 'Contraseña cambiada correctamente.' };
    },
  };
}
