import { HttpError } from '../../shared/http-error.js';
import { createAttendanceImpactRepository } from './impact.repository.js';

export function createAttendanceImpactService(repository = createAttendanceImpactRepository()) {
  return {
    dates: (...args) => repository.dates(...args),
    async assertInitialEnrollment(connection, data) {
      if (await repository.initialEnrollment(connection, data)) {
        throw new HttpError(409, 'El alta retroactiva afectaría un padrón de asistencia existente.');
      }
    },
  };
}
