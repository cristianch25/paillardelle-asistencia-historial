import { getPool } from '../../config/database.js';
import { enrollmentConditions } from './query-conditions.js';

export function createEnrollmentSearchQueries(poolProvider = getPool) {
  return {
    async searchForAttendance(data, access, connection = poolProvider()) {
      const where = enrollmentConditions({}, access, data.fecha, 'JOIN estudiantes e ON e.id = m.estudiante_id');
      const patterns = data.q ? data.q.split(' ').map(word => `%${word.replace(/[!%_]/g, '!$&')}%`) : [];
      const search = patterns.map(() => `AND CONCAT_WS(' ', e.nombres, e.apellido_paterno,
        e.apellido_materno, e.codigo_estudiante) COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!'`).join(' ');
      const [rows] = await connection.execute(`WITH candidatos AS (
        SELECT e.id AS estudiante_id, e.nombres, e.apellido_paterno, e.apellido_materno, e.codigo_estudiante,
          m.id AS matricula_id, y.id AS anio_escolar_id, y.anio, ms.id AS matricula_seccion_id,
          s.id AS seccion_id, s.nivel, s.grado, s.letra, s.turno,
          ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY ms.id) AS posicion,
          EXISTS (SELECT 1 FROM matricula_secciones otro WHERE otro.matricula_id = m.id
            AND otro.anio_escolar_id = m.anio_escolar_id AND otro.id <> ms.id
            AND otro.fecha_inicio <= ? AND (otro.fecha_fin IS NULL OR otro.fecha_fin >= ?)) AS vinculo_ambiguo
        ${where.sql} ${search})
        SELECT estudiante_id, nombres, apellido_paterno, apellido_materno, codigo_estudiante,
          matricula_id, anio_escolar_id, anio, matricula_seccion_id, seccion_id, nivel, grado, letra, turno, vinculo_ambiguo
        FROM candidatos WHERE posicion = 1 ORDER BY estudiante_id, anio_escolar_id, matricula_id LIMIT ? OFFSET ?`,
      [data.fecha, data.fecha, ...where.params, ...patterns, data.limit + 1, data.offset]);
      return rows.map(row => ({ ...row, ...Object.fromEntries(['estudiante_id', 'matricula_id', 'anio_escolar_id',
        'matricula_seccion_id', 'seccion_id'].map(key => [key, String(row[key])])) }));
    },
  };
}
