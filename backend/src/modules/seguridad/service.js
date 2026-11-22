import { HttpError } from '../../shared/http-error.js';
import { validatePagination } from '../../shared/query-validation.js';
import { createSecurityRepository } from './repository.js';

export function authorizeSecurityActor(actor) {
  if (!actor || (Object.hasOwn(actor, 'activo') && ![true, 1].includes(actor.activo))) throw new HttpError(401, 'Usuario no autenticado o inactivo.');
  if (actor.rol !== 'SUPERUSUARIO') throw new HttpError(403, 'Acceso reservado a SUPERUSUARIO.');
}

function account(id, nombres, apellidos, usuario) {
  return { id: id == null ? null : String(id), nombre: [nombres, apellidos].filter(Boolean).join(' ') || usuario || null };
}
function eventName(row) {
  if (row.accion === 'CREAR_SUPERUSUARIO_LOCAL') return 'Alta local de SUPERUSUARIO';
  if (row.accion === 'CREAR_USUARIO') return 'Usuario creado';
  if (row.accion === 'ACTUALIZAR_USUARIO') return 'Usuario actualizado';
  if (row.accion === 'ACTUALIZAR_NIVELES_ADICIONALES') return 'Permisos de usuario actualizados';
  if (row.accion === 'RESTABLECER_PASSWORD') return 'Contraseña restablecida';
  if (row.accion === 'CAMBIAR_PASSWORD') return 'Contraseña cambiada';
  if (['1', 'true', 1, true].includes(row.activo_nuevo)) return 'Cuenta activada';
  if (['0', 'false', 0, false].includes(row.activo_nuevo)) return 'Cuenta desactivada';
  return 'Estado de cuenta modificado';
}

export function createSecurityService(repository = createSecurityRepository()) {
  return {
    async list(actor, query = {}) {
      authorizeSecurityActor(actor);
      if (Object.keys(query).some(key => !['page', 'limit'].includes(key))) throw new HttpError(400, 'Consulta de seguridad inválida.');
      const { page, limit, offset } = validatePagination(query);
      const rows = await repository.list({ limit: limit + 1, offset });
      return { registros: rows.slice(0, limit).map(row => ({
        id: String(row.id), fecha_hora: row.fecha_hora instanceof Date ? row.fecha_hora.toISOString() : String(row.fecha_hora),
        responsable: row.accion === 'CREAR_SUPERUSUARIO_LOCAL' ? { id: null, nombre: 'Herramienta local de inicialización' }
          : account(row.usuario_id, row.actor_nombres, row.actor_apellidos, row.actor_usuario),
        cuenta: account(row.registro_id, row.target_nombres, row.target_apellidos, row.target_usuario),
        evento: eventName(row),
      })), pagination: { page, limit, has_more: rows.length > limit } };
    },
  };
}
