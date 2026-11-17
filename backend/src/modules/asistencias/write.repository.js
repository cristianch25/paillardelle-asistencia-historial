import { readInsertedId } from '../../shared/inserted-id.js';
import { sessionRow } from './context.repository.js';

export function createAttendanceWriter() {
  return {
    async open(connection, context, roster) {
      await connection.execute(`INSERT INTO sesiones_asistencia
        (anio_escolar_id, seccion_id, fecha, abierta_por, abierta_en) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [String(context.year.id), String(context.section.id), context.fecha, String(context.actor.id)]);
      const id = await readInsertedId(connection);
      for (const row of roster) await connection.execute(`INSERT INTO asistencias
        (sesion_id, anio_escolar_id, seccion_id, matricula_id, matricula_seccion_id, fecha, estado, version, justificada)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', 0, 0)`,
      [id, String(context.year.id), String(context.section.id), row.id, row.matricula_seccion_id, context.fecha]);
      return this.session(connection, id);
    },
    async session(connection, id) {
      const [rows] = await connection.execute('SELECT * FROM sesiones_asistencia WHERE id = ? FOR UPDATE', [id]);
      return sessionRow(rows[0]);
    },
    async mark(connection, change, actorId) {
      const { before } = change;
      const [updated] = await connection.execute(`UPDATE asistencias SET estado = ?, justificada = ?, motivo_justificacion = ?, version = version + 1,
        registrado_por = COALESCE(registrado_por, ?), primera_marca_en = COALESCE(primera_marca_en, UTC_TIMESTAMP(6)),
        updated_at = UTC_TIMESTAMP() WHERE id = ? AND version = ?`,
      [change.estado, change.justificada ? 1 : 0, change.motivo_justificacion, actorId, before.id, before.version]);
      if (updated.affectedRows !== 1) throw new Error('No se actualizó una única asistencia.');
      await connection.execute(`INSERT INTO historial_asistencias (asistencia_id, estado_anterior, estado_nuevo,
        justificada_anterior, justificada_nueva, modificado_por, fecha_modificacion, tipo,
        version_anterior, version_nueva, posterior_cierre, motivo, motivo_justificacion_anterior, motivo_justificacion_nuevo)
        VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), ?, ?, ?, ?, ?, ?, ?)`,
      [before.id, before.estado, change.estado, before.justificada ? 1 : 0, change.justificada ? 1 : 0,
        actorId, change.tipo, before.version, before.version + 1, change.posterior_cierre ? 1 : 0,
        change.motivo, before.motivo_justificacion ?? null, change.motivo_justificacion]);
    },
    async advance(connection, session, actorId, close = false) {
      const [result] = await connection.execute(`UPDATE sesiones_asistencia SET version = version + 1${close
        ? ", estado = 'CERRADA', cerrada_por = ?, cerrada_en = UTC_TIMESTAMP(6)" : ''} WHERE id = ? AND version = ?`,
      [...(close ? [actorId] : []), session.id, session.version]);
      if (result.affectedRows !== 1) throw new Error('No se actualizó una única sesión.');
      return this.session(connection, session.id);
    },
  };
}
