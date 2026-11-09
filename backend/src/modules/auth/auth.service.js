import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { AuthError, unauthorized } from './auth.errors.js';
import { createAuthRepository } from './auth.repository.js';
import { createTokenService } from './auth.tokens.js';

export function publicUser(user) {
  return {
    id: String(user.id),
    nombres: user.nombres,
    apellidos: user.apellidos,
    usuario: user.usuario,
    rol: user.rol,
    cargo: user.cargo,
    nivel_asignado: user.nivel_asignado,
    puede_escanear_qr: Boolean(user.puede_escanear_qr),
    puede_usar_bitacora: Boolean(user.puede_usar_bitacora),
  };
}

export function createAuthService({
  repository = createAuthRepository(), tokens = createTokenService(),
} = {}) {
  let dummyHash;

  return {
    async login(credentials) {
      const { usuario, password } = credentials ?? {};
      if (typeof usuario !== 'string' || usuario.trim().length === 0
        || Array.from(usuario).length > 60 || typeof password !== 'string'
        || password.length === 0 || Buffer.byteLength(password, 'utf8') > 72) {
        throw new AuthError(400, 'Envía usuario y password válidos; password admite hasta 72 bytes UTF-8.');
      }
      tokens.assertConfigured();
      const user = await repository.findByUsername(usuario);
      // También se ejecuta bcrypt para usuarios inexistentes, sin guardar nada en BD.
      dummyHash ??= bcrypt.hash(randomBytes(32).toString('hex'), 12);
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
