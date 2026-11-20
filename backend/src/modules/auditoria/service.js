import { HttpError } from '../../shared/http-error.js';
import { validatePagination } from '../../shared/query-validation.js';
import { createAdministrativeAuditRepository } from './repository.js';
import { formatAuditAction, formatAuditDescription } from './audit.description.js';

export {
  ACTION_LABELS,
  formatAuditAction,
  formatSectionLabel,
  formatStudentName,
  formatUserName,
  formatAuditDescription,
} from './audit.description.js';

function auditItem(row) {
  const actorNombre = [row.actor_nombres, row.actor_apellidos].filter(Boolean).join(' ') || 'Desconocido';
  return {
    id: String(row.id),
    fecha_hora: row.fecha_hora instanceof Date ? row.fecha_hora.toISOString() : String(row.fecha_hora),
    usuario: {
      id: String(row.usuario_id),
      nombre_completo: actorNombre,
      usuario: row.actor_usuario ?? '',
      rol: row.actor_rol ?? '',
    },
    accion: row.accion,
    accion_nombre: formatAuditAction(row.accion),
    entidad: row.entidad,
    registro_id: row.registro_id ? String(row.registro_id) : null,
    descripcion: formatAuditDescription(row),
  };
}

function authorizeAdmin(actor) {
  if (!actor || (Object.hasOwn(actor, 'activo') && !(actor.activo === 1 || actor.activo === true))) {
    throw new HttpError(401, 'No autenticado o usuario inactivo.');
  }
  if (actor.rol !== 'ADMIN') {
    throw new HttpError(403, 'Acceso denegado: reservado exclusivamente a ADMIN.');
  }
}

export function createAdministrativeAuditService(repository = createAdministrativeAuditRepository()) {
  return {
    contactPhone: (connection, actorId, before, after) => repository.append(connection, actorId,
      'ACTUALIZAR_TELEFONO_APODERADO', 'contactos', before, after),
    session: (connection, actorId, action, before, after) =>
      repository.append(connection, actorId, action, 'sesiones_asistencia', before, after),
    async list(actor, query = {}) {
      authorizeAdmin(actor);
      const { page, limit, offset } = validatePagination(query);
      const accion = typeof query.accion === 'string' ? query.accion.trim() : undefined;
      const rows = await repository.list({ limit: limit + 1, offset, accion });
      return {
        registros: rows.slice(0, limit).map(auditItem),
        pagination: { page, limit, has_more: rows.length > limit },
      };
    },
  };
}
