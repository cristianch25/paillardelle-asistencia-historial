import { assertPasswordChanged } from '../auth/auth.access.js';
import { getPool } from '../../config/database.js';
import { inTransaction } from '../../shared/transaction.js';
import { readInsertedId } from '../../shared/inserted-id.js';
import { finalizeAssignment } from './usuarios.asignaciones.finalize.repository.js';
import { assignmentCatalogRepository } from './usuarios.asignaciones.catalog.repository.js';

const fields = ['id', 'usuario_id', 'seccion_id', 'fecha_inicio', 'fecha_fin', 'created_at'];
const columns = fields.map(key => `a.${key}`).join(', ');
function publicRow(row) {
  const result = Object.fromEntries(fields.map(key => [key, row[key]]));
  for (const key of ['id', 'usuario_id', 'seccion_id']) result[key] = String(result[key]);
  return result;
}
function conditions(filters, access, today) {
  const clauses = [], params = [];
  for (const key of ['usuario_id', 'seccion_id', 'anio_escolar_id', 'nivel']) {
    if (filters[key] === undefined) continue;
    clauses.push(`${['usuario_id', 'seccion_id'].includes(key) ? 'a' : 's'}.${key} = ?`);
    params.push(filters[key]);
  }
  if (access.userId !== undefined) { clauses.push('a.usuario_id = ?'); params.push(access.userId); }
  if (access.levels !== undefined) {
    clauses.push(access.levels.length ? `s.nivel IN (${access.levels.map(() => '?').join(', ')})` : '1 = 0');
    params.push(...access.levels);
  }
  if (filters.vigencia === 'VIGENTE') {
    clauses.push('a.fecha_inicio <= ? AND (a.fecha_fin IS NULL OR a.fecha_fin >= ?)'); params.push(today, today);
  } else if (filters.vigencia === 'FUTURA') { clauses.push('a.fecha_inicio > ?'); params.push(today); }
  else if (filters.vigencia === 'FINALIZADA') { clauses.push('a.fecha_fin < ?'); params.push(today); }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}
export function createAssignmentsRepository(poolProvider = getPool) {
  return {
    ...assignmentCatalogRepository(poolProvider),
    finalize(data, actorId, hooks) {
      return finalizeAssignment(poolProvider(), data, actorId, hooks, columns, publicRow);
    },
    async list({ filters, access, today, limit, offset }) {
      const where = conditions(filters, access, today);
      const [rows] = await poolProvider().execute(
        `SELECT ${columns}, u.nombres, u.apellidos, u.cargo FROM asignaciones a
         JOIN secciones s ON s.id = a.seccion_id JOIN usuarios u ON u.id = a.usuario_id${where.sql} ORDER BY a.id ASC LIMIT ? OFFSET ?`,
        [...where.params, limit, offset],
      );
      return rows.map(row => ({ ...publicRow(row),
        usuario: { nombres: row.nombres, apellidos: row.apellidos, cargo: row.cargo } }));
    },
    create(data, actorId, hooks) {
      return this.createMany([data], actorId, hooks).then(rows => rows[0]);
    },
    createMany(items, actorId, hooks) {
      return inTransaction(poolProvider(), async connection => {
        // Mismo prefijo de bloqueos que edición de usuarios, incluso sin asignaciones previas.
        await connection.execute('SELECT id FROM usuarios WHERE rol = ? AND activo = ? ORDER BY id FOR UPDATE', ['ADMIN', 1]);
        const [actors] = await connection.execute('SELECT id, rol, activo, nivel_asignado, debe_cambiar_password FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId]);
        assertPasswordChanged(actors[0]);
        const actor = actors[0] ?? null;
        hooks.authorizeActor(actor);
        const [targets] = await connection.execute(
          'SELECT id, rol, activo, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [items[0].usuario_id],
        );
        const target = targets[0] ?? null;
        hooks.authorizeTarget(target);
        const locations = [];
        for (const item of items) {
          const [rows] = await connection.execute('SELECT anio_escolar_id FROM secciones WHERE id = ? LIMIT 1', [item.seccion_id]);
          locations.push(rows[0] ?? null);
        }
        const yearId = hooks.validateYears(locations);
        // Mismo año y secciones en orden numérico: validar todo antes de insertar.
        for (const data of items) {
          const context = await hooks.sectionContext(data.seccion_id, connection, actor);
          const [assignments] = await connection.execute(
            `SELECT ${columns} FROM asignaciones a WHERE a.usuario_id = ? AND a.seccion_id = ? ORDER BY a.id FOR UPDATE`,
            [data.usuario_id, data.seccion_id],
          );
          hooks.decide({ target, ...context, assignments }, data, yearId);
        }
        const created = [];
        for (const data of items) {
          const [result] = await connection.execute(
            'INSERT INTO asignaciones (usuario_id, seccion_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
            [data.usuario_id, data.seccion_id, data.fecha_inicio, data.fecha_fin],
          );
          if (result.affectedRows !== 1) throw new Error('No se creó una única asignación.');
          const id = await readInsertedId(connection);
          const [rows] = await connection.execute(`SELECT ${columns} FROM asignaciones a WHERE a.id = ? LIMIT 1`, [id]);
          if (!rows[0]) throw new Error('No se pudo consultar la asignación creada.');
          const row = publicRow(rows[0]);
          await connection.execute(
            `INSERT INTO auditoria_administrativa (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [actorId, 'CREAR_ASIGNACION', 'asignaciones', row.id, null, JSON.stringify(row)],
          );
          created.push(row);
        }
        return created;
      });
    },
  };
}
