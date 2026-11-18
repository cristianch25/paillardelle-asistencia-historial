import { createAdministrativeAuditRepository } from './repository.js';

export function createAdministrativeAuditService(repository = createAdministrativeAuditRepository()) {
  return { contactPhone: (connection, actorId, before, after) => repository.append(connection, actorId,
    'ACTUALIZAR_TELEFONO_APODERADO', 'contactos', before, after),
  session: (connection, actorId, action, before, after) =>
    repository.append(connection, actorId, action, 'sesiones_asistencia', before, after) };
}
