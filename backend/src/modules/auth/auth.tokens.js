// Emite y verifica tokens de acceso y conserva el límite original al renovarlos.
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

export function createTokenService(getConfig = readAuthConfig, now = () => Math.floor(Date.now() / 1000)) {
  function claims(token) {
    const { secret } = getConfig();
    let payload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience, clockTimestamp: now() });
    } catch { throw unauthorized(); }
    if (typeof payload.sub !== 'string' || !/^[1-9]\d{0,19}$/.test(payload.sub)
      || !Number.isInteger(payload.exp)) throw unauthorized();
    if (payload.auth_time !== undefined && (!Number.isInteger(payload.auth_time)
      || payload.auth_time > now() || payload.exp > payload.auth_time + 28800
      || now() >= payload.auth_time + 28800)) throw unauthorized();
    return payload;
  }
  function issue(userId, startedAt = now()) {
    const { secret, expiresIn } = getConfig(), issuedAt = now();
    const expiresAt = Math.min(issuedAt + expiresIn, startedAt + 28800);
    if (expiresAt <= issuedAt) throw unauthorized();
    return {
      access_token: jwt.sign({ auth_time: startedAt, iat: issuedAt, exp: expiresAt }, secret, {
        algorithm: 'HS256', subject: String(userId), issuer, audience,
      }),
      token_type: 'Bearer', expires_in: expiresAt - issuedAt,
      expires_at: expiresAt, session_expires_at: startedAt + 28800,
    };
  }
  return {
    assertConfigured() { getConfig(); },
    issue,
    verify: token => claims(token).sub,
    renew(token) {
      const payload = claims(token);
      // Los JWT sin auth_time conservan su validez hasta exp, pero no pueden renovarse.
      if (!Number.isInteger(payload.auth_time)) throw unauthorized();
      return issue(payload.sub, payload.auth_time);
    },
  };
}
