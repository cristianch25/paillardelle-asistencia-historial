import { getPool } from '../../config/database.js';

// Selección explícita: nunca se consulta password_hash en este módulo.
const columns = `id, nombres, apellidos, usuario, rol, cargo, nivel_asignado,
  puede_escanear_qr, puede_usar_bitacora, activo, created_at, updated_at`;

export function createUsuariosRepository(poolProvider = getPool) {
  return {
    async list({ limit, offset }) {
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM usuarios ORDER BY id ASC LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      return rows;
    },
    async findById(id) {
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM usuarios WHERE id = ? LIMIT 1`, [id],
      );
      return rows[0] ?? null;
    },
  };
}
