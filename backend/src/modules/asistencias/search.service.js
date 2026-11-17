import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { peruDate } from '../../shared/peru-date.js';
import { requireActor } from '../matriculas/access.js';
import { scopeFor } from './rules.js';
import { studentSearchQuery } from './search.validation.js';
import { createAttendanceSearchRepository } from './search.repository.js';

function result(row, record, fecha) {
  if (record?.asistencia_id !== null && record?.asistencia_id !== undefined
    && (String(record.matricula_seccion_id) !== row.matricula_seccion_id
      || String(record.seccion_id) !== row.seccion_id || String(record.asistencia_sesion_id) !== String(record.sesion_id))) {
    throw new HttpError(409, 'El contexto histórico de asistencia requiere revisión.');
  }
  const id = value => value === null || value === undefined ? null : String(value);
  return { estudiante: { id: row.estudiante_id, nombres: row.nombres, apellido_paterno: row.apellido_paterno,
    apellido_materno: row.apellido_materno, codigo_estudiante: row.codigo_estudiante },
  matricula_id: row.matricula_id, matricula_seccion_id: row.matricula_seccion_id,
  anio_escolar: { id: row.anio_escolar_id, anio: row.anio },
  seccion: { id: row.seccion_id, nivel: row.nivel, grado: row.grado, letra: row.letra, turno: row.turno }, fecha,
  situacion: record?.asistencia_id != null ? 'CON_REGISTRO' : record?.sesion_id != null ? 'SIN_ASISTENCIA' : 'SIN_SESION',
  estado: record?.estado ?? null, justificada: Boolean(record?.justificada),
  motivo_justificacion: record?.motivo_justificacion ?? null,
  sesion_id: id(record?.sesion_id), sesion_estado: record?.sesion_estado ?? null,
  sesion_version: record?.sesion_version ?? null, asistencia_id: id(record?.asistencia_id),
  asistencia_version: record?.asistencia_version ?? null };
}

export function createAttendanceSearchService({ enrollments, users, repository = createAttendanceSearchRepository(),
  getToday = peruDate } = {}) {
  return {
    async searchStudents(query, actor) {
      const data = studentSearchQuery(query);
      if (!actor) throw new HttpError(401, 'Autenticación requerida.');
      validateId(actor.id);
      return repository.read(actor.id, async (connection, current) => {
        requireActor(current, true, true);
        const access = await scopeFor(current, data.fecha, getToday(), users, connection);
        const page = await enrollments.searchForAttendance(data, access, connection);
        const rows = page.slice(0, data.limit);
        if (rows.some(row => Number(row.vinculo_ambiguo))) throw new HttpError(409, 'El padrón histórico contiene vínculos ambiguos.');
        const records = await repository.records(connection, rows, data.fecha);
        const byEnrollment = new Map(records.map(record => [String(record.matricula_id), record]));
        return { fecha: data.fecha, q: data.q,
          resultados: rows.map(row => result(row, byEnrollment.get(row.matricula_id), data.fecha)),
          pagination: { page: data.page, limit: data.limit, has_more: page.length > data.limit } };
      });
    },
  };
}
