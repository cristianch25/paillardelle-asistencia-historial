import { assertPasswordChanged } from '../auth/auth.access.js';
import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';
import { HttpError } from '../../shared/http-error.js';
import { requireActor } from '../matriculas/access.js';

export function createAttendanceContext(poolProvider = getPool) {
  return {
    transact(locator, actorId, sections, authorize, work) {
      return inTransaction(poolProvider(), async connection => {
        const [actors] = await connection.execute(
          'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId]);
        assertPasswordChanged(actors[0]);
        requireActor(actors[0], false, true);
        let location = locator;
        if (locator.id) {
          const [rows] = await connection.execute('SELECT seccion_id, fecha FROM sesiones_asistencia WHERE id = ?', [locator.id]);
          if (!rows[0]) throw new HttpError(404, 'Sesión no encontrada.');
          location = { seccion_id: String(rows[0].seccion_id), fecha: rows[0].fecha };
        }
        // Permisos del actor antes del año. Su bloqueo serializa cambios de asignaciones.
        const access = await authorize(actors[0] ?? null, location.fecha, connection);
        const context = await sections.assignmentContext(location.seccion_id, connection);
        const [sessions] = await connection.execute(`SELECT * FROM sesiones_asistencia
          WHERE seccion_id = ? AND fecha = ? FOR UPDATE`, [location.seccion_id, location.fecha]);
        const session = sessions[0] ? sessionRow(sessions[0]) : null;
        if (locator.id && session?.id !== locator.id) throw new HttpError(404, 'Sesión no encontrada.');
        return work({ ...context, ...location, access, session, actor: actors[0], connection });
      });
    },
  };
}
export function sessionRow(row) {
  return { ...row, ...Object.fromEntries(['id', 'seccion_id', 'anio_escolar_id', 'abierta_por']
    .map(key => [key, String(row[key])])), cerrada_por: row.cerrada_por === null ? null : String(row.cerrada_por) };
}
