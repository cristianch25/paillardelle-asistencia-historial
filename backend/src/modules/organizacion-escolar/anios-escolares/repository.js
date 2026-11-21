import { assertPasswordChanged } from '../../auth/auth.access.js';
import { getPool } from '../../../config/database.js';
import { inTransaction } from '../../../shared/transaction.js';

const columns = 'id, anio, fecha_inicio, fecha_fin, estado, created_at, updated_at';
function publicRow(row) {
  return { ...Object.fromEntries(columns.split(', ').map(field => [field, row[field]])), id: String(row.id) };
}
async function auditYear(connection, actorId, action, before, after) {
  await connection.execute(
    `INSERT INTO auditoria_administrativa
      (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, action, 'anios_escolares', after.id, before ? JSON.stringify(publicRow(before)) : null,
      JSON.stringify(publicRow(after))],
  );
}

export function createAniosEscolaresRepository(poolProvider = getPool) {
  function transition(id, actorId, authorize, decide, from, to, action) {
    return inTransaction(poolProvider(), async connection => {
      // Orden común con calendario: actor, año; ningún otro usuario después del año.
      const [actors] = await connection.execute(
        'SELECT id, rol, activo, debe_cambiar_password FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId],
      );
      assertPasswordChanged(actors[0]);
      authorize(actors[0] ?? null);
      const [current] = await connection.execute(
        `SELECT ${columns} FROM anios_escolares WHERE id = ? LIMIT 1 FOR UPDATE`, [id],
      );
      const before = current[0] ? publicRow(current[0]) : null;
      decide(before);
      const [result] = await connection.execute(
        'UPDATE anios_escolares SET estado = ? WHERE id = ? AND estado = ?', [to, id, from],
      );
      if (result.affectedRows !== 1) throw new Error('No se actualizó un único año escolar.');
      const [updated] = await connection.execute(`SELECT ${columns} FROM anios_escolares WHERE id = ? LIMIT 1`, [id]);
      if (!updated[0]) throw new Error('No se pudo consultar el año actualizado.');
      const after = publicRow(updated[0]);
      await auditYear(connection, actorId, action, before, after);
      return after;
    });
  }
  return {
    open(id, actorId, authorize, decide) {
      return transition(id, actorId, authorize, decide, 'PLANIFICADO', 'ABIERTO', 'ABRIR_ANIO_ESCOLAR');
    },
    close(id, actorId, authorize, decide) {
      return transition(id, actorId, authorize, decide, 'ABIERTO', 'CERRADO', 'CERRAR_ANIO_ESCOLAR');
    },
    create(data, actorId, authorize) {
      return inTransaction(poolProvider(), async connection => {
        // Lectura actual tras esperar el bloqueo; se mantiene hasta COMMIT/ROLLBACK.
        const [actors] = await connection.execute(
          'SELECT id, rol, activo, debe_cambiar_password FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId],
        );
        assertPasswordChanged(actors[0]);
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
        const year = publicRow(rows[0]);
        await auditYear(connection, actorId, 'CREAR_ANIO_ESCOLAR', null, year);
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
