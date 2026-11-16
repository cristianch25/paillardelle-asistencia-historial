import { getPool } from '../../config/database.js';
import { enrollmentConditions as conditions } from './query-conditions.js';
import { createEnrollmentSearchQueries } from './search.repository.js';
function publicRow(row) {
  return { ...row, ...Object.fromEntries(['id', 'estudiante_id', 'anio_escolar_id', 'seccion_id', 'matricula_seccion_id']
    .map(key => [key, String(row[key])])) };
}
export function createEnrollmentQueries(poolProvider = getPool) {
  return {
    ...createEnrollmentSearchQueries(poolProvider),
    async inspectForImport(ids, yearId) {
      if (!ids.length) return [];
      const [rows] = await poolProvider().execute(`SELECT m.id, m.estudiante_id, m.anio_escolar_id,
        m.estado, m.fecha_ingreso, m.fecha_retiro, ms.id AS matricula_seccion_id,
        ms.seccion_id, ms.fecha_inicio, ms.fecha_fin FROM matriculas m
        LEFT JOIN matricula_secciones ms ON ms.matricula_id = m.id AND ms.anio_escolar_id = m.anio_escolar_id
        WHERE m.anio_escolar_id = ? AND m.estudiante_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY m.id, ms.id`, [yearId, ...ids]);
      return rows.map(row => ({ ...row, id: String(row.id), estudiante_id: String(row.estudiante_id),
        anio_escolar_id: String(row.anio_escolar_id), seccion_id: row.seccion_id === null ? null : String(row.seccion_id) }));
    },
    async studentIds({ filters, access, date, limit, offset = 0 }, connection = poolProvider()) {
      const where = conditions(filters, access, date);
      const [rows] = await connection.execute(`SELECT DISTINCT m.estudiante_id ${where.sql}
        ORDER BY m.estudiante_id ASC${limit === undefined ? '' : ' LIMIT ? OFFSET ?'}`,
      [...where.params, ...(limit === undefined ? [] : [limit, offset])]);
      return rows.map(row => String(row.estudiante_id));
    },
    async list({ filters, access, date, limit, offset = 0 }, connection = poolProvider(), lock = false) {
      const where = conditions(filters, access, date);
      const [rows] = await connection.execute(`SELECT m.id, m.estudiante_id, m.anio_escolar_id,
        m.fecha_ingreso, m.fecha_retiro, m.estado, ms.id AS matricula_seccion_id, ms.seccion_id,
        ms.fecha_inicio, ms.fecha_fin ${where.sql} ORDER BY m.id ASC
        ${limit === undefined ? '' : 'LIMIT ? OFFSET ?'}${lock ? ' FOR UPDATE' : ''}`,
      [...where.params, ...(limit === undefined ? [] : [limit, offset])]);
      return rows.map(publicRow);
    },
  };
}
