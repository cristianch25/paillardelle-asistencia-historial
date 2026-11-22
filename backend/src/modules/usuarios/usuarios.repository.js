import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';
import { reconcileSupervision } from './usuarios.supervision.repository.js';
import { assertPasswordChanged } from '../auth/auth.access.js';

const columns = `id, nombres, apellidos, usuario, rol, cargo, nivel_asignado,
  activo, debe_cambiar_password, created_at, updated_at`;
const publicFields = columns.split(',').map(field => field.trim());
const insertColumns = ['nombres', 'apellidos', 'usuario', 'password_hash', 'rol',
  'cargo', 'nivel_asignado', 'activo', 'debe_cambiar_password'];
const updateColumns = insertColumns.filter(field => !['password_hash', 'debe_cambiar_password'].includes(field));

function publicRow(row) {
  return Object.fromEntries(publicFields.map(key => [key, row[key]]));
}

async function selectUser(connection, id, lock = false) {
  const [rows] = await connection.execute(
    `SELECT ${columns} FROM usuarios WHERE id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [id],
  );
  return rows[0] ? publicRow(rows[0]) : null;
}

async function writeUserAudit(connection, actorId, action, before, after) {
  await connection.execute(
    `INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, action, 'usuarios', String(after.id),
      before ? JSON.stringify(publicRow(before)) : null, JSON.stringify(publicRow(after))],
  );
}

export function createUsuariosRepository(poolProvider = getPool) {
  return {
    async historicalSectionIds(id, date, today, connection = poolProvider()) {
      const [rows] = await connection.execute(
        `SELECT DISTINCT a.seccion_id FROM asignaciones a WHERE a.usuario_id = ?
         AND a.fecha_inicio <= ? AND (a.fecha_fin IS NULL OR a.fecha_fin >= ?)
         AND EXISTS (SELECT 1 FROM asignaciones actual WHERE actual.usuario_id = a.usuario_id
           AND actual.seccion_id = a.seccion_id AND actual.fecha_inicio <= ?
           AND (actual.fecha_fin IS NULL OR actual.fecha_fin >= ?)) ORDER BY a.seccion_id ASC`,
        [id, date, date, today, today]);
      return rows;
    },
    async currentSectionIds(id, today) {
      const [rows] = await poolProvider().execute(
        `SELECT DISTINCT seccion_id FROM asignaciones WHERE usuario_id = ?
         AND fecha_inicio <= ? AND (fecha_fin IS NULL OR fecha_fin >= ?) ORDER BY seccion_id ASC`,
        [id, today, today],
      );
      return rows;
    },
    update(id, actorId, patch, decide) {
      return inTransaction(poolProvider(), async connection => {
        // Orden común: ADMIN activos, actor, destino, asignaciones; lecturas actuales.
        const [admins] = await connection.execute(
          'SELECT id FROM usuarios WHERE rol = ? AND activo = ? ORDER BY id FOR UPDATE', ['ADMIN', 1],
        );
        const actor = await selectUser(connection, actorId, true);
        assertPasswordChanged(actor);
        const current = id === actorId ? actor : await selectUser(connection, id, true);
        let assignments = [];
        if (current && (Object.hasOwn(patch, 'rol') || Object.hasOwn(patch, 'nivel_asignado'))) {
          // Bloquear también históricos evita cambios de períodos durante la decisión.
          [assignments] = await connection.execute(
            `SELECT a.id, a.fecha_fin, s.nivel FROM asignaciones a
             JOIN secciones s ON s.id = a.seccion_id
             WHERE a.usuario_id = ? ORDER BY a.id FOR UPDATE`, [id],
          );
        }
        const changes = decide({ current, actor, assignments, adminIds: admins.map(row => String(row.id)) });
        const fields = updateColumns.filter(field => Object.hasOwn(changes, field));
        if (!fields.length) return current;
        const [result] = await connection.execute(
          `UPDATE usuarios SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`,
          [...fields.map(field => changes[field]), id],
        );
        if (result.affectedRows !== 1) throw new Error('No se actualizó un único usuario.');
        const updated = await selectUser(connection, id, true);
        if (!updated) throw new Error('No se pudo consultar el usuario actualizado.');
        await reconcileSupervision(connection, current, updated, actorId);
        const action = Object.hasOwn(changes, 'activo') ? 'CAMBIAR_ESTADO_USUARIO' : 'ACTUALIZAR_USUARIO';
        await writeUserAudit(connection, actorId, action, current, updated);
        return updated;
      });
    },
    async findByUsername(username) {
      const [rows] = await poolProvider().execute(
        'SELECT id FROM usuarios WHERE usuario = ? LIMIT 1', [username],
      );
      return rows[0] ?? null;
    },
    create(data, actorId, authorize) {
      return inTransaction(poolProvider(), async connection => {
        // Lectura actual y bloqueo del actor hasta COMMIT/ROLLBACK, antes del alta.
        const actor = await selectUser(connection, actorId, true);
        assertPasswordChanged(actor);
        authorize(actor);
        const fields = insertColumns.filter(field => Object.hasOwn(data, field));
        const [result] = await connection.execute(
          `INSERT INTO usuarios (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
          fields.map(field => data[field]),
        );
        if (result.affectedRows !== 1) throw new Error('No se creó un único usuario.');
        const user = await selectUser(connection, String(result.insertId));
        if (!user) throw new Error('No se pudo consultar el usuario creado.');
        await writeUserAudit(connection, actorId, 'CREAR_USUARIO', null, user);
        return user;
      });
    },
    async list({ limit, offset, roles }) {
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM usuarios WHERE rol IN (${roles.map(() => '?').join(', ')})
         ORDER BY id ASC LIMIT ? OFFSET ?`, [...roles, limit, offset],
      );
      return rows;
    },
    findById(id) {
      return selectUser(poolProvider(), id);
    },
  };
}
