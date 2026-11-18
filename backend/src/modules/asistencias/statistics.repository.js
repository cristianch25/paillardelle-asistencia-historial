import { createAttendanceListRepository } from './list.repository.js';

export function createAttendanceStatisticsRepository(poolProvider) {
  // Reutiliza la lectura READ ONLY/REPEATABLE READ y la consulta del año.
  const { read, year } = createAttendanceListRepository(poolProvider);
  return {
    read, year,
    async aggregate(connection, data, levels) {
      const scope = levels.length ? `s.nivel IN (${levels.map(() => '?').join(', ')})` : '1 = 0';
      const [rows] = await connection.execute(`SELECT COUNT(DISTINCT sa.id) AS sesiones_con_registro,
        COALESCE(SUM(a.estado = 'PRESENTE'), 0) AS presentes,
        COALESCE(SUM(a.estado = 'TARDANZA'), 0) AS tardanzas,
        COALESCE(SUM(a.estado = 'FALTA'), 0) AS faltas,
        COALESCE(SUM(a.estado = 'PENDIENTE'), 0) AS pendientes
        FROM sesiones_asistencia sa
        JOIN secciones s ON s.id = sa.seccion_id AND s.anio_escolar_id = sa.anio_escolar_id
        LEFT JOIN asistencias a ON a.sesion_id = sa.id
        WHERE sa.anio_escolar_id = ? AND sa.fecha BETWEEN ? AND ? AND ${scope}`,
      [data.anio_escolar_id, data.fecha_desde, data.fecha_hasta, ...levels]);
      const counts = Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)]));
      if (Object.values(counts).some(value => !Number.isSafeInteger(value) || value < 0)) {
        throw new Error('Conteos de estadísticas fuera de rango.');
      }
      return counts;
    },
  };
}
