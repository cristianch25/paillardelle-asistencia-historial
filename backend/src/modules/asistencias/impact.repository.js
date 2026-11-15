export function createAttendanceImpactRepository() {
  return {
    async initialEnrollment(connection, data) {
      const [rows] = await connection.execute(`SELECT id FROM sesiones_asistencia
        WHERE seccion_id = ? AND anio_escolar_id = ? AND fecha >= ? ORDER BY id FOR UPDATE`,
      [data.seccion_id, data.anio_escolar_id, data.fecha_ingreso]);
      return rows.length > 0;
    },
    async dates(connection, yearId, level, start, end) {
      const [rows] = await connection.execute(`SELECT sa.id, sa.fecha FROM sesiones_asistencia sa
        JOIN secciones s ON s.id = sa.seccion_id AND s.anio_escolar_id = sa.anio_escolar_id
        WHERE sa.anio_escolar_id = ? AND s.nivel = ? AND sa.fecha BETWEEN ? AND ? ORDER BY sa.id FOR UPDATE`,
      [yearId, level, start, end]);
      return rows.map(row => row.fecha);
    },
  };
}
