import assert from 'node:assert/strict';

export async function checkAttendanceSchema(pool, { sessionId, rowId }) {
  let checks = 0;
  async function rejected(sql, params, code) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await assert.rejects(connection.execute(sql, params), error => error.code === code);
      checks++;
    } finally { await connection.rollback(); connection.release(); }
  }
  await rejected('UPDATE asistencias SET seccion_id=2 WHERE id=?', [rowId], 'ER_NO_REFERENCED_ROW_2');
  await rejected('UPDATE asistencias SET matricula_seccion_id=6 WHERE id=?', [rowId], 'ER_NO_REFERENCED_ROW_2');
  await rejected('UPDATE asistencias SET version=0 WHERE id=?', [rowId], 'ER_CHECK_CONSTRAINT_VIOLATED');
  await rejected('UPDATE asistencias SET justificada=2 WHERE id=?', [rowId], 'ER_CHECK_CONSTRAINT_VIOLATED');
  await rejected('UPDATE sesiones_asistencia SET cerrada_por=NULL WHERE id=?', [sessionId], 'ER_CHECK_CONSTRAINT_VIOLATED');
  await rejected(`INSERT INTO sesiones_asistencia (anio_escolar_id,seccion_id,fecha,abierta_por,abierta_en)
    SELECT anio_escolar_id,seccion_id,fecha,abierta_por,UTC_TIMESTAMP(6) FROM sesiones_asistencia WHERE id=?`, [sessionId], 'ER_DUP_ENTRY');
  await rejected('UPDATE historial_asistencias SET motivo=NULL WHERE asistencia_id=? AND posterior_cierre=1', [rowId], 'ER_CHECK_CONSTRAINT_VIOLATED');
  await rejected('UPDATE historial_asistencias SET posterior_cierre=2 WHERE asistencia_id=?', [rowId], 'ER_CHECK_CONSTRAINT_VIOLATED');
  await rejected('UPDATE historial_asistencias SET version_nueva=version_anterior+2 WHERE asistencia_id=? AND version_anterior=0', [rowId], 'ER_CHECK_CONSTRAINT_VIOLATED');
  await rejected(`INSERT INTO historial_asistencias (asistencia_id,estado_anterior,estado_nuevo,justificada_anterior,
    justificada_nueva,modificado_por,fecha_modificacion,tipo,version_anterior,version_nueva,posterior_cierre,motivo)
    SELECT asistencia_id,estado_anterior,estado_nuevo,justificada_anterior,justificada_nueva,modificado_por,
      fecha_modificacion,tipo,version_anterior,version_nueva,posterior_cierre,motivo
    FROM historial_asistencias WHERE asistencia_id=? AND version_anterior=0`, [rowId], 'ER_DUP_ENTRY');
  return checks;
}
