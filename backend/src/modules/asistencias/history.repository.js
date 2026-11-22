import { getPool } from '../../config/database.js';
import { createAttendanceListRepository } from './list.repository.js';

export function fechaModificacionUtc(value) {
  if (value instanceof Date) return value.toISOString();
  // UTC_TIMESTAMP(6) llega como DATETIME sin zona; no interpretarlo en la zona de Node.
  const iso = String(value).replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)$/, '$1T$2Z');
  return new Date(iso).toISOString();
}

export function createAttendanceHistoryRepository(poolProvider = getPool) {
  const { read } = createAttendanceListRepository(poolProvider);
  return {
    read,
    async findContext(connection, asistenciaId) {
      const [rows] = await connection.execute(
        `SELECT a.id AS asistencia_id, a.sesion_id, a.fecha, a.estado AS estado_actual,
                a.justificada AS justificada_actual, a.motivo_justificacion AS motivo_justificacion_actual,
                a.version AS version_actual,
                s.id AS seccion_id, s.nivel, s.grado, s.letra, s.turno,
                e.id AS estudiante_id, e.codigo_estudiante, e.nombres AS estudiante_nombres,
                e.apellido_paterno AS estudiante_apellido_paterno, e.apellido_materno AS estudiante_apellido_materno
         FROM asistencias a
         JOIN secciones s ON s.id = a.seccion_id
         JOIN matriculas m ON m.id = a.matricula_id
         JOIN estudiantes e ON e.id = m.estudiante_id
         WHERE a.id = ? LIMIT 1`,
        [asistenciaId]
      );
      if (!rows.length) return null;
      const row = rows[0];
      const fecha = row.fecha instanceof Date
        ? row.fecha.toISOString().slice(0, 10)
        : String(row.fecha).slice(0, 10);
      return {
        asistencia_id: String(row.asistencia_id),
        sesion_id: String(row.sesion_id),
        fecha,
        estado_actual: row.estado_actual,
        justificada_actual: Boolean(row.justificada_actual),
        motivo_justificacion_actual: row.motivo_justificacion_actual ?? null,
        version_actual: Number(row.version_actual),
        seccion: {
          id: String(row.seccion_id),
          nivel: row.nivel,
          grado: Number(row.grado),
          letra: row.letra,
          turno: row.turno,
        },
        estudiante: {
          id: String(row.estudiante_id),
          codigo_estudiante: row.codigo_estudiante ?? null,
          nombres: row.estudiante_nombres,
          apellido_paterno: row.estudiante_apellido_paterno,
          apellido_materno: row.estudiante_apellido_materno ?? null,
        },
      };
    },
    async findHistory(connection, asistenciaId) {
      const [rows] = await connection.execute(
        `SELECT h.id, h.asistencia_id, h.tipo, h.estado_anterior, h.estado_nuevo,
                h.justificada_anterior, h.justificada_nueva, h.motivo,
                h.motivo_justificacion_anterior, h.motivo_justificacion_nuevo,
                h.fecha_modificacion, h.version_anterior, h.version_nueva,
                h.posterior_cierre,
                u.id AS usuario_id, u.nombres AS usuario_nombres, u.apellidos AS usuario_apellidos,
                u.usuario AS usuario_username, u.rol AS usuario_rol
         FROM historial_asistencias h
         JOIN usuarios u ON u.id = h.modificado_por
         WHERE h.asistencia_id = ?
         ORDER BY h.version_nueva ASC, h.fecha_modificacion ASC`,
        [asistenciaId]
      );
      return rows.map(row => ({
        id: String(row.id),
        asistencia_id: String(row.asistencia_id),
        tipo: row.tipo,
        estado_anterior: row.estado_anterior,
        estado_nuevo: row.estado_nuevo,
        justificada_anterior: Boolean(row.justificada_anterior),
        justificada_nueva: Boolean(row.justificada_nueva),
        motivo: row.motivo ?? null,
        motivo_justificacion_anterior: row.motivo_justificacion_anterior ?? null,
        motivo_justificacion_nuevo: row.motivo_justificacion_nuevo ?? null,
        version_anterior: Number(row.version_anterior),
        version_nueva: Number(row.version_nueva),
        posterior_cierre: Boolean(row.posterior_cierre),
        fecha_modificacion: fechaModificacionUtc(row.fecha_modificacion),
        modificado_por: {
          id: String(row.usuario_id),
          usuario: row.usuario_username,
          nombres: row.usuario_nombres,
          apellidos: row.usuario_apellidos,
          rol: row.usuario_rol,
        },
      }));
    },
  };
}
