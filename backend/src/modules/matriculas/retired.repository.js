export async function listRetiredStudents(connection, sectionId, yearId) {
  const [rows] = await connection.execute(`SELECT m.id, m.estudiante_id, m.anio_escolar_id,
    m.fecha_ingreso, m.fecha_retiro, m.estado,
    ms.id AS matricula_seccion_id, ms.seccion_id, ms.fecha_inicio, ms.fecha_fin
    FROM matriculas m
    JOIN matricula_secciones ms ON ms.matricula_id = m.id AND ms.fecha_fin = m.fecha_retiro
    WHERE ms.seccion_id = ? AND m.anio_escolar_id = ? AND m.estado = 'RETIRADA'
    ORDER BY m.fecha_retiro DESC, m.id DESC`, [sectionId, yearId]);
  return rows.map(row => ({
    id: String(row.id),
    estudiante_id: String(row.estudiante_id),
    anio_escolar_id: String(row.anio_escolar_id),
    fecha_ingreso: row.fecha_ingreso,
    fecha_retiro: row.fecha_retiro,
    estado: row.estado,
    matricula_seccion_id: String(row.matricula_seccion_id),
    seccion_id: String(row.seccion_id),
    fecha_inicio: row.fecha_inicio,
    fecha_fin: row.fecha_fin,
  }));
}
