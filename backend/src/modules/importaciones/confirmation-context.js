import { createImportReconciliationService } from './reconciliation.service.js';
import { createReconciliationRepository } from './reconciliation.repository.js';
import { createStudentsRepository } from '../estudiantes/repository.js';
import { createStudentIdentitiesService } from '../estudiantes/service.js';
import { createEnrollmentRepository } from '../matriculas/repository.js';
import { createEnrollmentService } from '../matriculas/service.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { createSeccionesRepository } from '../organizacion-escolar/secciones/repository.js';
import { createSeccionesService } from '../organizacion-escolar/secciones/service.js';
import { createAniosEscolaresRepository } from '../organizacion-escolar/anios-escolares/repository.js';
import { createAniosEscolaresService } from '../organizacion-escolar/anios-escolares/service.js';

// Adaptar los servicios existentes a una conexión; ninguna llamada abre otra transacción.
export function confirmationContext(connection) {
  const provider = () => connection, users = createUsuariosService();
  const usuariosService = { supervisionLevels: actor => users.supervisionLevels(actor, connection) };
  const identitiesService = createStudentIdentitiesService({ repository: createStudentsRepository(provider, true) });
  const seccionesService = createSeccionesService({ repository: createSeccionesRepository(provider), usuariosService });
  const matriculasService = createEnrollmentService({ repository: createEnrollmentRepository(provider),
    usuariosService, identitiesService, seccionesService,
    // D42/RN-44 V8: solo SIAGIE conserva los padrones de sesiones ya creadas.
    // La confirmación bloquea actor/años/secciones/sesiones antes de usar este servicio.
    attendanceImpact: { async assertInitialEnrollment() {} } });
  const reconcile = createImportReconciliationService({ connection, usuariosService, identitiesService, seccionesService,
    matriculasService, repository: createReconciliationRepository(provider, true),
    aniosService: createAniosEscolaresService({ repository: createAniosEscolaresRepository(provider) }) });
  return { reconcile, matriculasService, identitiesService };
}
