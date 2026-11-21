import { assertPasswordChanged } from '../auth/auth.access.js';
import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';

export function createPasswordResetRepository(poolProvider = getPool) {
  return {
    reset(id, hash, actorId, authorize, requireTarget) {
      return inTransaction(poolProvider(), async connection => {
        // Prefijo compatible con edición de usuarios y asignaciones.
        await connection.execute('SELECT id FROM usuarios WHERE rol = ? AND activo = ? ORDER BY id FOR UPDATE', ['ADMIN', 1]);
        const [actors] = await connection.execute('SELECT id, rol, activo, debe_cambiar_password FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId]);
        assertPasswordChanged(actors[0]);
        authorize(actors[0] ?? null);
        const [targets] = await connection.execute('SELECT id, rol, activo FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [id]);
        requireTarget(targets[0] ?? null);
        const required = targets[0].rol === 'ADMIN';
        const [result] = await connection.execute(
          `UPDATE usuarios SET password_hash = ?${required ? ', debe_cambiar_password = ?' : ''} WHERE id = ?`,
          required ? [hash, true, id] : [hash, id]);
        if (result.affectedRows !== 1) throw new Error('No se restableció una única cuenta.');
        await connection.execute(`INSERT INTO auditoria_administrativa
          (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
          VALUES (?, ?, ?, ?, ?, ?)`,
        [actorId, 'RESTABLECER_PASSWORD', 'usuarios', id, null, JSON.stringify({ password_restablecida: true,
          ...(required ? { debe_cambiar_password: true } : {}) })]);
      });
    },
  };
}
