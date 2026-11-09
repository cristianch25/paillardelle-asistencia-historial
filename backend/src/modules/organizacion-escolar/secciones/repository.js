import { getPool } from '../../../config/database.js';
import { inTransaction } from '../../../shared/transaction.js';

const fields = ['id', 'anio_escolar_id', 'nivel', 'grado', 'letra', 'turno', 'activo'];
const columns = fields.map(field => `s.${field}`).join(', ');
function conditions(filters, access) {
  const clauses = [], params = [];
  for (const [field, value] of Object.entries(filters)) {
    if (!['anio_escolar_id', 'nivel', 'grado', 'activo', 'id'].includes(field)) continue;
    clauses.push(`s.${field} = ?`);
    params.push(value);
  }
  if (access.nivel !== undefined) { clauses.push('s.nivel = ?'); params.push(access.nivel); }
  if (access.ids !== undefined) {
    clauses.push(access.ids.length ? `s.id IN (${access.ids.map(() => '?').join(', ')})` : '1 = 0');
    params.push(...access.ids);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

export function createSeccionesRepository(poolProvider = getPool) {
  return {
    async list({ filters, access, limit, offset }) {
      const where = conditions(filters, access);
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM secciones s${where.sql} ORDER BY s.id ASC LIMIT ? OFFSET ?`,
        [...where.params, limit, offset],
      );
      return rows;
    },
    async findById(id, access) {
      const where = conditions({ id }, access);
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM secciones s${where.sql} LIMIT 1`, where.params,
      );
      return rows[0] ?? null;
    },
    create(data, actorId, decide) {
      return inTransaction(poolProvider(), async connection => {
        // Orden de escritura: actor, año; sin adquirir otros usuarios después.
        const [actors] = await connection.execute(
          'SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId],
        );
        const [years] = await connection.execute(
          'SELECT id, estado FROM anios_escolares WHERE id = ? LIMIT 1 FOR UPDATE', [data.anio_escolar_id],
        );
        decide(actors[0] ?? null, years[0] ?? null);
        const [result] = await connection.execute(
          `INSERT INTO secciones (anio_escolar_id, nivel, grado, letra, turno, activo) VALUES (?, ?, ?, ?, ?, ?)`,
          [data.anio_escolar_id, data.nivel, data.grado, data.letra, data.turno ?? null, true],
        );
        if (result.affectedRows !== 1) throw new Error('No se creó una única sección.');
        const [rows] = await connection.execute(
          `SELECT ${columns} FROM secciones s WHERE s.id = ? LIMIT 1`, [String(result.insertId)],
        );
        if (!rows[0]) throw new Error('No se pudo consultar la sección creada.');
        const row = Object.fromEntries(fields.map(field => [field, rows[0][field]]));
        row.id = String(row.id);
        row.anio_escolar_id = String(row.anio_escolar_id);
        row.activo = Boolean(row.activo);
        await connection.execute(
          `INSERT INTO auditoria_administrativa
            (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [actorId, 'CREAR_SECCION', 'secciones', row.id, null, JSON.stringify(row)],
        );
        return row;
      });
    },
  };
}
