// Guarda vistas previas temporales en memoria, con caducidad y cupos por usuario y proceso.
import { randomBytes } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';

export const PREVIEW_TTL = 30 * 60 * 1000;
export function createPreviewStore({ now = Date.now } = {}) {
  const previews = new Map();
  function remove(id) { clearTimeout(previews.get(id)?.timer); previews.delete(id); }
  function clean() {
    for (const [id, value] of previews) if (value.expires <= now()) remove(id);
  }
  // Solo pueden sustituirse vistas cargadas del mismo dueño que no estén confirmándose.
  function replaceable(actorId, exceptId) {
    return [...previews].filter(([id, row]) => id !== exceptId && row.actorId === actorId && row.ready && !row.confirming);
  }
  return {
    reserve(actorId) {
      clean();
      const own = [...previews.values()].filter(row => row.actorId === actorId);
      if (previews.size >= 20 || own.length >= 3) {
        const previous = replaceable(actorId)[0];
        if (previous) remove(previous[0]);
        else if (own.length >= 3) {
          throw new HttpError(429, 'Tienes cargas o confirmaciones en curso. Espera a que terminen y vuelve a generar la vista previa.');
        } else {
          throw new HttpError(429, 'El servicio alcanzó el límite de vistas previas. Intenta nuevamente cuando se libere un cupo.');
        }
      }
      const id = randomBytes(32).toString('hex'), expires = now() + PREVIEW_TTL;
      const timer = setTimeout(() => remove(id), PREVIEW_TTL); timer.unref();
      previews.set(id, { actorId, expires, timer });
      return id;
    },
    get(id, actorId) {
      clean();
      const value = previews.get(id);
      if (!value || value.actorId !== actorId) throw new HttpError(404, 'La vista previa no existe, caducó o fue reemplazada. Carga nuevamente el archivo.');
      return value;
    },
    complete(id, actorId, data) {
      Object.assign(this.get(id, actorId), data, { ready: true });
      // Síncrono con reserve/acquire: nunca retirar cargas ni confirmaciones activas.
      for (const [previousId] of replaceable(actorId, id)) remove(previousId);
    },
    remove,
  };
}
