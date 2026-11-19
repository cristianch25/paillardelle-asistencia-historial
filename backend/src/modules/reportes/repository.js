import { createAttendanceListRepository } from '../asistencias/list.repository.js';

export function createMonthlyReportRepository(poolProvider) {
  const { read } = createAttendanceListRepository(poolProvider);
  return {
    read,
    async section(connection, data) {
      const [rows] = await connection.execute(`SELECT s.id, s.nivel, s.grado, s.letra,
        y.anio, y.fecha_inicio, y.fecha_fin, y.estado FROM secciones s
        JOIN anios_escolares y ON y.id = s.anio_escolar_id
        WHERE s.id = ? AND s.anio_escolar_id = ?`, [data.seccion_id, data.anio_escolar_id]);
      return rows[0] ? { ...rows[0], id: String(rows[0].id) } : null;
    },
    async students(connection, data) {
      // Unión de vínculos efectivos e integrantes del padrón guardado, sin reconstruir sesiones.
      const [rows] = await connection.execute(`WITH integrantes AS (
        SELECT m.estudiante_id FROM matriculas m JOIN matricula_secciones ms
          ON ms.matricula_id = m.id AND ms.anio_escolar_id = m.anio_escolar_id
        WHERE m.anio_escolar_id = ? AND ms.seccion_id = ?
          AND GREATEST(m.fecha_ingreso, ms.fecha_inicio, ?) <=
            LEAST(COALESCE(m.fecha_retiro, ?), COALESCE(ms.fecha_fin, ?), ?)
        UNION
        SELECT m.estudiante_id FROM asistencias a JOIN sesiones_asistencia sa
          ON sa.id = a.sesion_id AND sa.seccion_id = a.seccion_id AND sa.anio_escolar_id = a.anio_escolar_id
        JOIN matriculas m ON m.id = a.matricula_id AND m.anio_escolar_id = a.anio_escolar_id
        WHERE sa.anio_escolar_id = ? AND sa.seccion_id = ? AND sa.fecha BETWEEN ? AND ?)
        SELECT e.id, e.apellido_paterno, e.apellido_materno, e.nombres FROM integrantes i
        JOIN estudiantes e ON e.id = i.estudiante_id
        ORDER BY e.apellido_paterno, e.apellido_materno, e.nombres, e.id LIMIT 31`,
      [data.anio_escolar_id, data.seccion_id, data.desde, data.hasta, data.hasta, data.hasta,
        data.anio_escolar_id, data.seccion_id, data.desde, data.hasta]);
      return rows.map(row => ({ ...row, id: String(row.id) }));
    },
    async marks(connection, data) {
      const [rows] = await connection.execute(`SELECT m.estudiante_id, sa.fecha, a.estado, a.justificada
        FROM sesiones_asistencia sa JOIN asistencias a ON a.sesion_id = sa.id
          AND a.anio_escolar_id = sa.anio_escolar_id AND a.seccion_id = sa.seccion_id AND a.fecha = sa.fecha
        JOIN matriculas m ON m.id = a.matricula_id AND m.anio_escolar_id = a.anio_escolar_id
        WHERE sa.anio_escolar_id = ? AND sa.seccion_id = ? AND sa.fecha BETWEEN ? AND ?
        ORDER BY m.estudiante_id, sa.fecha`, [data.anio_escolar_id, data.seccion_id, data.desde, data.hasta]);
      return rows.map(row => ({ ...row, estudiante_id: String(row.estudiante_id) }));
    },
    async staff(connection, data) {
      const [rows] = await connection.execute(`SELECT DISTINCT u.id, u.nombres, u.apellidos, u.cargo
        FROM asignaciones a JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.seccion_id = ? AND a.fecha_inicio <= ? AND (a.fecha_fin IS NULL OR a.fecha_fin >= ?)
        ORDER BY u.apellidos, u.nombres, u.id`, [data.seccion_id, data.hasta, data.desde]);
      return rows;
    },
  };
}
