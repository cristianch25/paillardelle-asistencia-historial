import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';
import { requiresPasswordChange } from './auth.access.js';
import { unauthorized } from './auth.errors.js';

const publicColumns = `id, nombres, apellidos, usuario, rol, cargo, nivel_asignado,
  activo, debe_cambiar_password`;

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
    changePassword(id, verifyAndHash) {
      return inTransaction(poolProvider(), async connection => {
        const [rows] = await connection.execute(
          'SELECT id, password_hash, activo, rol, debe_cambiar_password FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE',
          [id],
        );
        const user = rows[0] ?? null;
        if (!user || !(user.activo === 1 || user.activo === true)) {
          throw unauthorized();
        }
        const newHash = await verifyAndHash(user.password_hash, user);
        const required = requiresPasswordChange(user);
        const [result] = await connection.execute(
          `UPDATE usuarios SET password_hash = ?${required ? ', debe_cambiar_password = ?' : ''} WHERE id = ?`,
          required ? [newHash, false, id] : [newHash, id],
        );
        if (result.affectedRows !== 1) throw new Error('No se actualizó la contraseña.');
        await connection.execute(`INSERT INTO auditoria_administrativa
          (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
          VALUES (?, ?, ?, ?, ?, ?)`,
        [id, 'CAMBIAR_PASSWORD', 'usuarios', id, null, JSON.stringify({ password_cambiada: true,
          ...(required ? { debe_cambiar_password: false } : {}) })]);
      });
    },
  };
}
