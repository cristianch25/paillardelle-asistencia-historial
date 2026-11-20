import { randomBytes } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';
import { hashPassword } from '../../shared/passwords.js';
import { validateId } from '../../shared/query-validation.js';
import { unauthorized } from '../auth/auth.errors.js';
import { createPasswordResetRepository } from './usuarios.password.repository.js';

export function createPasswordResetService({ repository = createPasswordResetRepository(), hash = hashPassword,
  generate = () => randomBytes(18).toString('base64url') } = {}) {
  return {
    async reset(id, body, actorId) {
      validateId(id);
      if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
        throw new HttpError(400, 'El restablecimiento no admite campos; confirma con un objeto vacío.');
      }
      const temporary = generate(), passwordHash = await hash(temporary);
      try {
        await repository.reset(id, passwordHash, actorId, actor => {
          if (!actor || !(actor.activo === 1 || actor.activo === true)) throw unauthorized();
          if (actor.rol !== 'ADMIN') throw new HttpError(403, 'Solo ADMIN puede restablecer contraseñas.');
        }, target => { if (!target) throw new HttpError(404, 'Usuario no encontrado.'); });
      } catch (error) {
        if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new HttpError(409, 'Conflicto concurrente; consulta antes de volver a restablecer.');
        throw error;
      }
      // Solo tras COMMIT confirmado; nunca se guarda el secreto en auditoría o en el servicio.
      return { usuario_id: id, password_temporal: temporary };
    },
  };
}
