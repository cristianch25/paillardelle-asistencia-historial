import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';

const columns = 'id, anio, fecha_inicio, fecha_fin, estado, created_at, updated_at';

export function createAniosEscolaresRepository(poolProvider = getPool) {
  return {
    create(data, actorId, authorize) {
      return inTransaction(poolProvider(), async connection => {
        // Lectura actual tras esperar el bloqueo; se mantiene hasta COMMIT/ROLLBACK.
        const [actors] = await connection.execute(
          'SELECT id, rol, activo FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId],
        );
        authorize(actors[0] ?? null);
        const [result] = await connection.execute(
          `INSERT INTO anios_escolares (anio, fecha_inicio, fecha_fin, estado) VALUES (?, ?, ?, ?)`,
          [data.anio, data.fecha_inicio, data.fecha_fin, 'PLANIFICADO'],
        );
        if (result.affectedRows !== 1) throw new Error('No se creó un único año escolar.');
        const [rows] = await connection.execute(
          `SELECT ${columns} FROM anios_escolares WHERE id = ? LIMIT 1`, [String(result.insertId)],
        );
        if (!rows[0]) throw new Error('No se pudo consultar el año creado.');
        const year = Object.fromEntries(columns.split(', ').map(field => [field, rows[0][field]]));
        year.id = String(year.id);
        await connection.execute(
          `INSERT INTO auditoria_administrativa
            (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [actorId, 'CREAR_ANIO_ESCOLAR', 'anios_escolares', year.id, null, JSON.stringify(year)],
        );
        return year;
      });
    },
    async list({ limit, offset }) {
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM anios_escolares ORDER BY id ASC LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      return rows;
    },
    async findById(id) {
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM anios_escolares WHERE id = ? LIMIT 1`, [id],
      );
      return rows[0] ?? null;
    },
  };
}
