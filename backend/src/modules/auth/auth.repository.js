import { getPool } from '../../config/database.js';

const publicColumns = `id, nombres, apellidos, usuario, rol, cargo, nivel_asignado,
  puede_escanear_qr, puede_usar_bitacora, activo`;

export function createAuthRepository(poolProvider = getPool) {
  return {
    async findByUsername(username) {
      const [rows] = await poolProvider().execute(
        `SELECT ${publicColumns}, password_hash FROM usuarios WHERE usuario = ? LIMIT 1`,
        [username],
      );
      return rows[0] ?? null;
    },
    async findById(id) {
      const [rows] = await poolProvider().execute(
        `SELECT ${publicColumns} FROM usuarios WHERE id = ? LIMIT 1`,
        [id],
      );
      return rows[0] ?? null;
    },
  };
}
