import { HttpError } from '../../shared/http-error.js';
import { createUsuariosRepository } from './usuarios.repository.js';
import { validateNewUser, validateUserId, validateUserPatch, validateRoleLevel } from './usuarios.validation.js';
import { hashPassword } from '../../shared/passwords.js';
import { peruDate } from '../../shared/peru-date.js';
import { accountRoles, authorizeAccountCreation, authorizeAccountOperation } from './usuarios.authorization.js';
import { validatePagination } from '../../shared/query-validation.js';
import { createSupervisionService } from './usuarios.supervision.service.js';
import { createPasswordResetService } from './usuarios.password.service.js';
import { requiresPasswordChange } from '../auth/auth.access.js';

export function publicUser(user) {
  return {
    id: String(user.id),
    nombres: user.nombres,
    apellidos: user.apellidos,
    usuario: user.usuario,
    rol: user.rol,
    cargo: user.cargo,
    nivel_asignado: user.nivel_asignado,
    debe_cambiar_password: requiresPasswordChange(user),
  };
}

function planUserUpdate({ current, actor, adminIds, assignments }, patch, today, stateOnly) {
  // Revalidar al actor después de esperar los bloqueos de otras peticiones.
  authorizeAccountOperation(actor, current, stateOnly ? 'state' : 'edit', patch.rol);
  const next = { ...current, ...patch };
  validateRoleLevel(next);
  const changes = Object.fromEntries(Object.entries(patch).filter(([key, value]) =>
    (typeof value === 'boolean' ? Boolean(current[key]) : current[key]) !== value));
  if (Object.keys(changes).length === 0) return changes;
  if (current.rol === 'ADMIN' && current.activo
    && (next.rol !== 'ADMIN' || !next.activo) && adminIds.length <= 1) {
    throw new HttpError(409, 'Debe conservarse al menos un ADMIN activo.');
  }
  const pendingAssignments = assignments.filter(item => item.fecha_fin === null || item.fecha_fin >= today);
  if (changes.rol && current.rol === 'REGISTRADOR' && next.rol !== 'REGISTRADOR'
    && pendingAssignments.length) {
    throw new HttpError(409, 'Regulariza las asignaciones actuales o futuras antes de cambiar el rol.');
  }
  if (Object.hasOwn(changes, 'nivel_asignado') && next.nivel_asignado !== null
    && pendingAssignments.some(item => item.nivel !== next.nivel_asignado)) {
    throw new HttpError(409, 'El nivel no coincide con las asignaciones actuales o futuras.');
  }
  return changes;
}

function updateConflict(error) {
  if (error.code === 'ER_DUP_ENTRY') return new HttpError(409, 'El identificador de usuario ya está registrado.');
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
    return new HttpError(409, 'Conflicto concurrente: vuelve a intentar la operación.');
  }
  return error;
}

function userDetails(user) {
  return {
    ...publicUser(user),
    activo: Boolean(user.activo),
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export function createUsuariosService({ repository = createUsuariosRepository(), getToday = peruDate,
  supervision = createSupervisionService(), passwords = createPasswordResetService() } = {}) {
  return {
    resetPassword: (id, body, actorId) => passwords.reset(id, body, actorId),
    async historicalSectionIds(id, date, today = getToday(), connection) {
      validateUserId(id);
      const rows = await repository.historicalSectionIds(id, date, today, connection);
      return rows.map(row => String(row.seccion_id));
    },
    supervisionLevels: (user, connection, options) => supervision.levelsFor(user, connection, options),
    getAdditionalLevels: id => supervision.get(id),
    updateAdditionalLevels: (id, body, actorId) => supervision.update(id, body, actorId),
    async currentSectionIds(id, today = getToday()) {
      validateUserId(id);
      const rows = await repository.currentSectionIds(id, today);
      return rows.map(row => String(row.seccion_id));
    },
    async update(id, body, actorId, stateOnly = false) {
      validateUserId(id);
      const patch = validateUserPatch(body, stateOnly);
      try {
        return userDetails(await repository.update(id, actorId, patch,
          context => planUserUpdate(context, patch, getToday(), stateOnly)));
      } catch (error) {
        throw updateConflict(error);
      }
    },
    async create(body, actorId) {
      const data = validateNewUser(body);
      if (data.rol === 'ADMIN') data.debe_cambiar_password = true;
      if (await repository.findByUsername(data.usuario)) {
        throw new HttpError(409, 'El identificador de usuario ya está registrado.');
      }
      data.password_hash = await hashPassword(body.password);
      try {
        return userDetails(await repository.create(data, actorId,
          actor => authorizeAccountCreation(actor, data.rol)));
      } catch (error) {
        // La restricción UNIQUE es la garantía final, también con peticiones concurrentes.
        throw updateConflict(error);
      }
    },
    async list(query = {}, actor) {
      const roles = accountRoles(actor);
      const { page, limit, offset } = validatePagination(query);
      // Una fila extra permite informar si hay otra página, sin contar toda la tabla.
      const rows = await repository.list({ limit: limit + 1, offset, roles });
      return {
        users: rows.slice(0, limit).map(userDetails),
        pagination: { page, limit, has_more: rows.length > limit },
      };
    },
    async findById(id, actor) {
      const roles = accountRoles(actor);
      validateUserId(id);
      const user = await repository.findById(id);
      if (!user) throw new HttpError(404, 'Usuario no encontrado.');
      if (!roles.includes(user.rol)) throw new HttpError(403, 'Sin permiso para consultar esta cuenta.');
      return userDetails(user);
    },
  };
}
