import { HttpError } from '../../shared/http-error.js';
import { educationLevels } from '../../shared/education-levels.js';
import { validateId } from '../../shared/query-validation.js';
import { unauthorized } from '../auth/auth.errors.js';
import { createSupervisionRepository, readAdditionalLevels } from './usuarios.supervision.repository.js';
import { validateAdditionalLevels } from './usuarios.validation.js';

function effective(user, additional) {
  if (!user || !(user.activo === 1 || user.activo === true) || user.rol !== 'SUBDIRECCION'
    || !educationLevels.includes(user.nivel_asignado)) return [];
  return educationLevels.filter(level => level === user.nivel_asignado || additional.includes(level));
}
function target(user) {
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');
  if (['ADMIN', 'SUPERUSUARIO'].includes(user.rol)) {
    throw new HttpError(403, 'Sin permiso para administrar niveles de esta cuenta.');
  }
  if (user.rol !== 'SUBDIRECCION' || !educationLevels.includes(user.nivel_asignado)) {
    throw new HttpError(409, 'El usuario debe ser SUBDIRECCION con nivel principal válido.');
  }
}
function response({ user, levels }) {
  return { usuario_id: String(user.id), nivel_principal: user.nivel_asignado,
    niveles_adicionales: educationLevels.filter(level => levels.includes(level)),
    niveles_efectivos: effective(user, levels) };
}
export function createSupervisionService({ repository = createSupervisionRepository() } = {}) {
  return {
    async levelsFor(user, connection, options) {
      if (user.rol !== 'SUBDIRECCION') return [];
      if (connection) return effective(user, await readAdditionalLevels(connection, user.id, options));
      const current = await repository.inspect(user.id);
      return current ? effective(current.user, current.levels) : [];
    },
    async get(id) {
      validateId(id);
      const current = await repository.inspect(id);
      target(current?.user);
      return response(current);
    },
    async update(id, body, actorId) {
      validateId(id);
      const levels = validateAdditionalLevels(body);
      try {
        return response(await repository.update(id, actorId, levels, (actor, user) => {
          if (!actor || !(actor.activo === 1 || actor.activo === true)) throw unauthorized();
          if (actor.rol !== 'ADMIN') throw new HttpError(403, 'Acceso reservado a ADMIN.');
          target(user);
          if (levels.includes(user.nivel_asignado)) throw new HttpError(409, 'El nivel principal no puede ser adicional.');
        }));
      } catch (error) {
        if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
          throw new HttpError(409, 'Conflicto concurrente: vuelve a intentar la operación.');
        }
        throw error;
      }
    },
  };
}
