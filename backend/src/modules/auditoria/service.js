import { createAdministrativeAuditRepository } from './repository.js';

export function createAdministrativeAuditService(repository = createAdministrativeAuditRepository()) {
  return { session: (connection, actorId, action, before, after) =>
    repository.append(connection, actorId, action, 'sesiones_asistencia', before, after) };
}
