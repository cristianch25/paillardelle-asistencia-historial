import { createHash } from 'node:crypto';
import { AuthError } from './auth.errors.js';

const waitMs = 60 * 1000;
const windowMs = 15 * 60 * 1000;
const keyFor = value => createHash('sha256').update(value).digest('hex');
// Límite local por proceso. En AWS con varias instancias requiere además un
// control compartido del proxy. No confiar en X-Forwarded-For sin configurar proxy.
export function createLoginLimit({ now = Date.now, maxEntries = 10000 } = {}) {
  const entries = new Map();
  function denied(until) {
    const error = new AuthError(429, 'Demasiados intentos. Inténtalo nuevamente cuando termine la espera');
    error.code = 'LOGIN_RATE_LIMIT';
    error.remainingAttempts = 0;
    error.retryAfter = Math.max(1, Math.ceil((until - now()) / 1000));
    throw error;
  }
  return {
    begin(username, origin) {
      const time = now();
      for (const [key, entry] of entries) {
        entry.failures = entry.failures.filter(failedAt => failedAt > time - windowMs);
        if (!entry.pending && !entry.failures.length && entry.until <= time) entries.delete(key);
      }
      const name = username.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase();
      const keys = [`account:${keyFor(name)}`, `origin:${keyFor(String(origin))}`];
      const limits = [5, 30];
      const missing = keys.filter(key => !entries.has(key)).length;
      if (entries.size + missing > maxEntries) denied(time + waitMs);
      const rows = keys.map(key => entries.get(key) ?? { failures: [], pending: 0, until: 0 });
      const available = (entry, index) => entry.until > now() ? 0 : Math.max(0,
        (entry.failures.length >= limits[index] ? 1 : limits[index] - entry.failures.length) - entry.pending);
      const blocked = rows.filter((entry, index) => available(entry, index) === 0);
      if (blocked.length) denied(Math.max(time + 1000, ...blocked.map(entry => entry.until)));
      rows.forEach((entry, index) => { entry.pending++; entries.set(keys[index], entry); });
      let finished = false;
      return outcome => {
        if (finished) return;
        finished = true;
        rows.forEach((entry, index) => {
          entry.pending--;
          if (outcome === 'failed') {
            entry.failures = entry.failures.filter(failedAt => failedAt > now() - windowMs);
            entry.failures.push(now());
            entry.failures = entry.failures.slice(-limits[index]);
            if (entry.failures.length >= limits[index]) entry.until = now() + waitMs;
          } else if (outcome === 'success' && index === 0) entry.failures = [];
        });
        // Tras un bloqueo se permite una sola comprobación, conservando el historial.
        const remainingAttempts = Math.min(...rows.map(available));
        const blockedUntil = rows.filter((entry, index) => available(entry, index) === 0)
          .reduce((until, entry) => Math.max(until, entry.until), now());
        return { remainingAttempts, retryAfter: remainingAttempts === 0
          ? Math.max(1, Math.ceil((blockedUntil - now()) / 1000)) : 0 };
      };
    },
  };
}
