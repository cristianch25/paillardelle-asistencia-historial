import { assertPasswordChanged } from '../auth/auth.access.js';
import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';

export async function readAdditionalLevels(connection, id, { readOnly = false } = {}) {
  const [rows] = await connection.execute(
    `SELECT nivel FROM usuario_niveles_adicionales WHERE usuario_id = ? ORDER BY nivel${readOnly ? '' : ' FOR UPDATE'}`, [id],
  );
  return rows.map(row => row.nivel);
}

async function replaceLevels(connection, id, levels) {
  await connection.execute('DELETE FROM usuario_niveles_adicionales WHERE usuario_id = ?', [id]);
  for (const level of levels) {
    await connection.execute('INSERT INTO usuario_niveles_adicionales (usuario_id, nivel) VALUES (?, ?)', [id, level]);
  }
}

function snapshot(user, levels) {
  return { rol: user.rol, nivel_principal: user.nivel_asignado, niveles_adicionales: levels };
}

async function auditLevels(connection, actorId, id, before, after) {
  await connection.execute(
    `INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, 'ACTUALIZAR_NIVELES_ADICIONALES', 'usuario_niveles_adicionales', id,
      JSON.stringify(before), JSON.stringify(after)],
  );
}

export async function reconcileSupervision(connection, before, after, actorId) {
  if (before.rol !== 'SUBDIRECCION'
    || (after.rol === before.rol && after.nivel_asignado === before.nivel_asignado)) return;
  const previous = await readAdditionalLevels(connection, String(after.id));
  const next = after.rol === 'SUBDIRECCION' ? previous.filter(level => level !== after.nivel_asignado) : [];
  if (next.length === previous.length) return;
  await replaceLevels(connection, String(after.id), next);
  await auditLevels(connection, actorId, String(after.id), snapshot(before, previous), snapshot(after, next));
}

export function createSupervisionRepository(poolProvider = getPool) {
  return {
    async inspect(id) {
      const [rows] = await poolProvider().execute(
        `SELECT u.id, u.rol, u.activo, u.nivel_asignado, n.nivel FROM usuarios u
         LEFT JOIN usuario_niveles_adicionales n ON n.usuario_id = u.id WHERE u.id = ? ORDER BY n.nivel`, [id],
      );
      return rows.length ? { user: rows[0], levels: rows.filter(row => row.nivel !== null).map(row => row.nivel) } : null;
    },
    update(id, actorId, levels, decide) {
      return inTransaction(poolProvider(), async connection => {
        // Mismo orden que las ediciones de usuarios: ADMIN activos, actor, destino.
        await connection.execute(
          'SELECT id FROM usuarios WHERE rol = ? AND activo = ? ORDER BY id FOR UPDATE', ['ADMIN', 1],
        );
        const [actors] = await connection.execute(
          'SELECT id, rol, activo, debe_cambiar_password FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId],
        );
        assertPasswordChanged(actors[0]);
        const [targets] = await connection.execute(
          'SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [id],
        );
        const user = targets[0] ?? null;
        decide(actors[0] ?? null, user);
        const previous = await readAdditionalLevels(connection, id);
        if (previous.length === levels.length && previous.every(level => levels.includes(level))) {
          return { user, levels: previous };
        }
        await replaceLevels(connection, id, levels);
        await auditLevels(connection, actorId, id, snapshot(user, previous), snapshot(user, levels));
        return { user, levels };
      });
    },
  };
}
