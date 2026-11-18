import { randomBytes } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';

export const PREVIEW_TTL = 30 * 60 * 1000;
export function createPreviewStore({ now = Date.now } = {}) {
  const previews = new Map();
  function remove(id) { clearTimeout(previews.get(id)?.timer); previews.delete(id); }
  function clean() {
    for (const [id, value] of previews) if (value.expires <= now()) remove(id);
  }
  return {
    reserve(actorId) {
      clean();
      if (previews.size >= 20 || [...previews.values()].filter(row => row.actorId === actorId).length >= 3) {
        throw new HttpError(429, 'Hay demasiadas vistas previas abiertas. Espera a que caduquen.');
      }
      const id = randomBytes(32).toString('hex'), expires = now() + PREVIEW_TTL;
      const timer = setTimeout(() => remove(id), PREVIEW_TTL); timer.unref();
      previews.set(id, { actorId, expires, timer });
      return id;
    },
    get(id, actorId) {
      clean();
      const value = previews.get(id);
      if (!value || value.actorId !== actorId) throw new HttpError(404, 'La vista previa no existe o ha caducado. Carga nuevamente el archivo.');
      return value;
    },
    complete(id, actorId, data) { Object.assign(this.get(id, actorId), data); },
    remove,
  };
}
