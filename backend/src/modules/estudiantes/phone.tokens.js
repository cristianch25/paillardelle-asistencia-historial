import { randomBytes } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';

export function createPhoneTokens({ now = Date.now, ttl = 300000, limit = 1000 } = {}) {
  const entries = new Map();
  return {
    assertFresh(entry) {
      if (entry.expires <= now()) throw new HttpError(409, 'La vista previa venció. Solicita otra.');
    },
    issue(data) {
      const time = now();
      for (const [key, entry] of entries) if (entry.expires <= time) entries.delete(key);
      if (entries.size >= limit) throw new HttpError(429, 'Hay demasiadas vistas previas pendientes. Intenta más tarde.');
      const token = randomBytes(32).toString('hex'), expires = time + ttl;
      entries.set(token, { ...data, expires });
      return { token_confirmacion: token, vence_en: new Date(expires).toISOString() };
    },
    take(token, actorId, studentId) {
      const entry = entries.get(token);
      if (!entry || entry.expires <= now() || entry.actorId !== actorId || entry.studentId !== studentId) {
        if (entry?.expires <= now()) entries.delete(token);
        throw new HttpError(409, 'La vista previa ya no es válida. Solicita otra.');
      }
      // Consumo síncrono antes de esperar SQL: también invalida confirmaciones en curso o inciertas.
      entries.delete(token);
      return entry;
    },
  };
}
