import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';

function conditions(data, access) {
  const clauses = ['s.anio_escolar_id = ?'], params = [data.anio_escolar_id];
  for (const key of ['nivel', 'seccion_id']) if (data[key] !== undefined) {
    clauses.push(`s.${key === 'seccion_id' ? 'id' : key} = ?`); params.push(data[key]);
  }
  for (const [key, column] of [['levels', 's.nivel'], ['ids', 's.id']]) if (access[key] !== undefined) {
    clauses.push(access[key].length ? `${column} IN (${access[key].map(() => '?').join(', ')})` : '1 = 0');
    params.push(...access[key]);
  }
  return { sql: clauses.join(' AND '), params };
}
export function createAttendanceListRepository(poolProvider = getPool) {
  return {
    read(actorId, work) {
      // Características solo de la siguiente transacción; no quedan activas en el pool.
      const readPool = { async getConnection() {
        const connection = await poolProvider().getConnection();
        try {
          await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
          await connection.query('SET TRANSACTION READ ONLY');
          return connection;
        } catch (error) { try { connection.destroy(); } catch { /* preservar error */ } throw error; }
      } };
      return inTransaction(readPool, async connection => {
        const [actors] = await connection.execute('SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1', [actorId]);
        return work(connection, actors[0] ?? null);
      });
    },
    async year(connection, id) {
      const [rows] = await connection.execute('SELECT id, fecha_inicio, fecha_fin, estado FROM anios_escolares WHERE id = ? LIMIT 1', [id]);
      return rows[0] ?? null;
    },
    async sectionVisible(connection, data, access) {
      const where = conditions(data, access);
      const [rows] = await connection.execute(`SELECT s.id FROM secciones s WHERE ${where.sql} LIMIT 1`, where.params);
      return rows.length > 0;
    },
    async page(connection, data, access) {
      const where = conditions(data, access);
      const [rows] = await connection.execute(`WITH pagina AS (
        SELECT s.id, s.anio_escolar_id, s.nivel, s.grado, s.letra, s.turno, s.activo
        FROM secciones s WHERE ${where.sql} ORDER BY s.id LIMIT ? OFFSET ?)
        SELECT p.*, sa.id AS sesion_id, sa.estado AS estado_sesion FROM pagina p
        LEFT JOIN sesiones_asistencia sa ON sa.seccion_id = p.id
          AND sa.anio_escolar_id = p.anio_escolar_id AND sa.fecha = ? ORDER BY p.id`,
      [...where.params, data.limit + 1, data.offset, data.fecha]);
      return rows.map(row => ({ ...row, id: String(row.id), anio_escolar_id: String(row.anio_escolar_id),
        sesion_id: row.sesion_id === null ? null : String(row.sesion_id), activo: Boolean(row.activo) }));
    },
    async counts(connection, sessionIds) {
      if (!sessionIds.length) return new Map();
      const [rows] = await connection.execute(`SELECT sesion_id, estado, COUNT(*) AS cantidad FROM asistencias
        WHERE sesion_id IN (${sessionIds.map(() => '?').join(', ')}) GROUP BY sesion_id, estado`, sessionIds);
      const result = new Map(sessionIds.map(id => [id, []]));
      for (const row of rows) result.get(String(row.sesion_id)).push({ estado: row.estado, cantidad: Number(row.cantidad) });
      return result;
    },
  };
}
