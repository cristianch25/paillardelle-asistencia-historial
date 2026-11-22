import { HttpError } from '../../shared/http-error.js';
import { validatePagination } from '../../shared/query-validation.js';
import { createAdministrativeAuditRepository } from './repository.js';
import { formatAuditAction, formatAuditDescription } from './audit.description.js';
import { attendanceAuditItem } from './attendance-item.js';
import { fechaModificacionUtc } from '../asistencias/history.repository.js';
import { readAuditCategory } from './operational-categories.js';

export {
  ACTION_LABELS,
  formatAuditAction,
  formatSectionLabel,
  formatStudentName,
  formatUserName,
  formatAuditDescription,
} from './audit.description.js';

function auditItem(row) {
  // En el alta inicial, usuario_id referencia la cuenta creada; no es un actor web.
  const localInitialization = row.accion === 'CREAR_SUPERUSUARIO_LOCAL';
  const actorNombre = localInitialization ? 'Herramienta local de inicialización'
    : [row.actor_nombres, row.actor_apellidos].filter(Boolean).join(' ') || 'Desconocido';
  return {
    id: String(row.id),
    origen: row.origen ?? 'administrativa',
    fecha_hora: row.origen === 'asistencia' ? fechaModificacionUtc(row.fecha_hora)
      : row.fecha_hora instanceof Date ? row.fecha_hora.toISOString() : String(row.fecha_hora),
    usuario: {
      id: String(row.usuario_id),
      nombre_completo: actorNombre,
      usuario: localInitialization ? 'inicializacion_local' : row.actor_usuario ?? '',
      rol: localInitialization ? '' : row.actor_rol ?? '',
    },
    accion: row.accion,
    accion_nombre: localInitialization ? 'Alta inicial local de SUPERUSUARIO' : formatAuditAction(row.accion),
    entidad: row.entidad,
    registro_id: row.registro_id ? String(row.registro_id) : null,
    descripcion: row.origen === 'asistencia' ? 'Cambio individual de asistencia.' : formatAuditDescription(row),
    ...(row.origen === 'asistencia' ? { asistencia: attendanceAuditItem(row) } : {}),
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
      if (Object.keys(query).some(key => !['page', 'limit', 'categoria'].includes(key))) throw new HttpError(400, 'Consulta de actividades inválida.');
      const { page, limit, offset } = validatePagination(query);
      const categoria = readAuditCategory(query.categoria);
      const rows = await repository.list({ limit: limit + 1, offset, categoria });
      return {
        registros: rows.slice(0, limit).map(auditItem),
        pagination: { page, limit, has_more: rows.length > limit },
      };
    },
  };
}
