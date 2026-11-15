export function createAttendanceReader() {
  return {
    async rows(connection, sessionId) {
      const [rows] = await connection.execute(`SELECT a.*, e.id AS estudiante_id, e.codigo_estudiante,
        e.apellido_paterno, e.apellido_materno, e.nombres FROM asistencias a
        JOIN matriculas m ON m.id = a.matricula_id JOIN estudiantes e ON e.id = m.estudiante_id
        WHERE a.sesion_id = ? ORDER BY a.id FOR UPDATE`, [sessionId]);
      return rows.map(row => ({ ...row, ...Object.fromEntries(['id', 'sesion_id', 'anio_escolar_id', 'seccion_id',
        'matricula_id', 'matricula_seccion_id', 'estudiante_id'].map(key => [key, String(row[key])])),
      registrado_por: row.registrado_por === null ? null : String(row.registrado_por), justificada: Boolean(row.justificada) }));
    },
    async lastChanges(connection, sessionId) {
      const [rows] = await connection.execute(`SELECT h.asistencia_id, h.modificado_por, h.fecha_modificacion
        FROM historial_asistencias h JOIN asistencias a ON a.id = h.asistencia_id
        WHERE a.sesion_id = ? AND h.version_nueva = a.version FOR SHARE`, [sessionId]);
      return new Map(rows.map(row => [String(row.asistencia_id), {
        usuario_id: String(row.modificado_por), fecha: row.fecha_modificacion }]));
    },
  };
}
