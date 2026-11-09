import { getPool } from '../../config/database.js';

const columns = 'id, anio, fecha_inicio, fecha_fin, estado, created_at, updated_at';

export function createAniosEscolaresRepository(poolProvider = getPool) {
  return {
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
