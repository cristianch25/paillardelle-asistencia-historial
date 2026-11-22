export function attendanceAuditItem(row) {
  return {
    tipo: row.tipo,
    fecha: row.asistencia_fecha instanceof Date ? row.asistencia_fecha.toISOString().slice(0, 10) : String(row.asistencia_fecha).slice(0, 10),
    estudiante: { id: String(row.asistencia_estudiante_id), nombre_completo:
      [row.asistencia_paterno, row.asistencia_materno, row.asistencia_nombres].filter(Boolean).join(' ') },
    seccion: { id: String(row.asistencia_seccion_id), nivel: row.asistencia_nivel, grado: row.asistencia_grado, letra: row.asistencia_letra },
    estado_anterior: row.estado_anterior, estado_nuevo: row.estado_nuevo,
    justificada_anterior: Boolean(row.justificada_anterior), justificada_nueva: Boolean(row.justificada_nueva),
    motivo_justificacion_anterior: row.motivo_justificacion_anterior ?? null,
    motivo_justificacion_nuevo: row.motivo_justificacion_nuevo ?? null, motivo: row.motivo ?? null,
  };
}
