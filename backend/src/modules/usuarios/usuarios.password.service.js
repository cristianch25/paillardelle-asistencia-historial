import { randomBytes } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';
import { hashPassword, isValidNewPassword } from '../../shared/passwords.js';
import { validateId } from '../../shared/query-validation.js';
import { authorizeAccountActor, authorizeAccountOperation } from './usuarios.authorization.js';
import { createPasswordResetRepository } from './usuarios.password.repository.js';

export function createPasswordResetService({ repository = createPasswordResetRepository(), hash = hashPassword,
  generate = () => randomBytes(18).toString('base64url') } = {}) {
  return {
    async reset(id, body, actorId) {
      validateId(id);
      if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
        throw new HttpError(400, 'El restablecimiento no admite campos; confirma con un objeto vacío.');
      }
      const temporary = generate();
      if (!isValidNewPassword(temporary)) throw new Error('No se pudo generar una contraseña temporal válida.');
      const passwordHash = await hash(temporary);
      try {
        let lockedActor;
        await repository.reset(id, passwordHash, actorId, actor => {
          authorizeAccountActor(actor);
          lockedActor = actor;
        }, target => authorizeAccountOperation(lockedActor, target, 'password'));
      } catch (error) {
        if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) throw new HttpError(409, 'Conflicto concurrente; consulta antes de volver a restablecer.');
        throw error;
      }
      // Solo tras COMMIT confirmado; nunca se guarda el secreto en auditoría o en el servicio.
      return { usuario_id: id, password_temporal: temporary };
    },
  };
}
