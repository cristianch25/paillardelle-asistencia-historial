import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { createStudentsRepository } from './repository.js';
import { validateStudent } from './validation.js';
import { createStudentProfileService } from './profile.service.js';
import { createGuardianPhoneService } from './phone.service.js';

export function createStudentIdentitiesService({ repository = createStudentsRepository() } = {}) {
  return {
    matchImportIdentities: records => repository.matchImportIdentities(records),
    readIdentities: ids => repository.list({ ids, limit: Math.max(1, ids.length), offset: 0 }),
    // Internos: conservan la conexión y transacción del alta de matrícula.
    async lockIdentity(id, connection) {
      validateId(id);
      const row = await repository.find(id, connection, true);
      if (!row) throw new HttpError(404, 'Estudiante no encontrado.');
      return row;
    },
    async insertIdentity(data, actorId, connection, visibleIds) {
      const possible = (!data.codigo_estudiante && !data.numero_documento)
        ? await repository.possibleDuplicates(data, visibleIds, connection) : false;
      const estudiante = await repository.insert(data, actorId, connection);
      return { estudiante, advertencias: possible
        ? ['Posible coincidencia de nombres en el ámbito autorizado; revisar manualmente.'] : [] };
    },
  };
}

export function createStudentsService({ repository = createStudentsRepository(), matriculasService,
  profileService = createStudentProfileService(), phoneService = createGuardianPhoneService() } = {}) {
  if (!matriculasService) throw new Error('Se requiere el servicio de matrículas.');
  return {
    ...profileService,
    ...phoneService,
    async create(body, actor) {
      const data = validateStudent(body);
      return matriculasService.createStandalone(data, actor);
    },
    async list(query, actor) {
      const selection = await matriculasService.studentSelection(query, actor);
      const rows = await repository.list(selection);
      return { estudiantes: rows.slice(0, selection.pageSize), pagination: {
        page: selection.page, limit: selection.pageSize,
        has_more: selection.hasMore ?? rows.length > selection.pageSize } };
    },
  };
}
