import { HttpError } from '../../shared/http-error.js';
import { createAttendanceImpactRepository } from './impact.repository.js';

export function createAttendanceImpactService(repository = createAttendanceImpactRepository()) {
  async function assertNoSessions(connection, data, message) {
    if (await repository.initialEnrollment(connection, data)) throw new HttpError(409, message);
  }
  return {
    dates: (...args) => repository.dates(...args),
    assertInitialEnrollment: (connection, data) => assertNoSessions(connection, data,
      'El alta retroactiva afectaría un padrón de asistencia existente.'),
    assertSectionEntry(connection, { seccion_id, anio_escolar_id, fecha_inicio }) {
      // D42/RN-44 V8: el vínculo nuevo no reconstruye padrones de sesiones ya creadas.
      return assertNoSessions(connection, { seccion_id, anio_escolar_id, fecha_ingreso: fecha_inicio },
        'No se puede realizar el movimiento: la sección de destino tiene sesiones de asistencia desde la fecha efectiva indicada. Debe conservarse su padrón histórico.');
    },
  };
}
