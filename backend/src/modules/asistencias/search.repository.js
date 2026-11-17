import { getPool } from '../../config/database.js';
import { createAttendanceListRepository } from './list.repository.js';

export function createAttendanceSearchRepository(poolProvider = getPool) {
  return {
    read: createAttendanceListRepository(poolProvider).read,
    async records(connection, rows, fecha) {
      if (!rows.length) return [];
      const [records] = await connection.execute(`SELECT j.matricula AS matricula_id, sa.id AS sesion_id,
        sa.version AS sesion_version, sa.estado AS sesion_estado, a.id AS asistencia_id,
        a.version AS asistencia_version, a.estado, a.matricula_seccion_id, a.seccion_id,
        a.sesion_id AS asistencia_sesion_id, a.justificada, a.motivo_justificacion
        FROM JSON_TABLE(?, '$[*]' COLUMNS(matricula BIGINT UNSIGNED PATH '$.matricula_id',
          anio BIGINT UNSIGNED PATH '$.anio_escolar_id', seccion BIGINT UNSIGNED PATH '$.seccion_id')) j
        LEFT JOIN asistencias a ON a.matricula_id = j.matricula AND a.fecha = ?
        LEFT JOIN sesiones_asistencia sa ON sa.anio_escolar_id = j.anio
          AND sa.seccion_id = j.seccion AND sa.fecha = ?`,
      [JSON.stringify(rows.map(({ matricula_id, anio_escolar_id, seccion_id }) => ({
        matricula_id, anio_escolar_id, seccion_id }))), fecha, fecha]);
      return records;
    },
  };
}
