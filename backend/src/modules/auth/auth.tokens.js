import '../../config/env.js';
import jwt from 'jsonwebtoken';
import { AuthError, unauthorized } from './auth.errors.js';

const issuer = 'paillardelle-asistencia';
const audience = 'paillardelle-asistencia-api';

export function readAuthConfig(env = process.env) {
  const secret = env.AUTH_JWT_SECRET;
  const duration = env.AUTH_JWT_EXPIRES_IN_SECONDS ?? '900';
  const expiresIn = Number(duration);
  if (typeof secret !== 'string' || secret.trim().length === 0
    || Buffer.byteLength(secret, 'utf8') < 32
    || !/^\d+$/.test(duration) || !Number.isSafeInteger(expiresIn) || expiresIn < 1) {
    throw new AuthError(503, 'Autenticación no disponible: revisa su configuración.');
  }
  return { secret, expiresIn };
}

export function createTokenService(getConfig = readAuthConfig) {
  return {
    assertConfigured() { getConfig(); },
    issue(userId) {
      const { secret, expiresIn } = getConfig();
      return {
        access_token: jwt.sign({}, secret, {
          algorithm: 'HS256', subject: String(userId), expiresIn, issuer, audience,
        }),
        token_type: 'Bearer',
        expires_in: expiresIn,
      };
    },
    verify(token) {
      const { secret } = getConfig();
      let payload;
      try {
        payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
      } catch {
        throw unauthorized();
      }
      if (typeof payload.sub !== 'string' || !/^[1-9]\d{0,19}$/.test(payload.sub)
        || !Number.isInteger(payload.exp)) {
        throw unauthorized();
      }
      return payload.sub;
    },
  };
}
