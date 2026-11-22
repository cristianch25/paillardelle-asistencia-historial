import { assertPasswordChanged } from '../../auth/auth.access.js';
import { getPool } from '../../../config/database.js';
import { inTransaction } from '../../../shared/transaction.js';
import { updateSection } from './update.repository.js';
import { HttpError } from '../../../shared/http-error.js';

const fields = ['id', 'anio_escolar_id', 'nivel', 'grado', 'letra', 'turno', 'activo'];
const columns = fields.map(field => `s.${field}`).join(', ');
function conditions(filters, access) {
  const clauses = [], params = [];
  for (const [field, value] of Object.entries(filters)) {
    if (!['anio_escolar_id', 'nivel', 'grado', 'activo', 'id'].includes(field)) continue;
    clauses.push(`s.${field} = ?`);
    params.push(value);
  }
  if (access.levels !== undefined) {
    clauses.push(access.levels.length ? `s.nivel IN (${access.levels.map(() => '?').join(', ')})` : '1 = 0');
    params.push(...access.levels);
  }
  if (access.ids !== undefined) {
    clauses.push(access.ids.length ? `s.id IN (${access.ids.map(() => '?').join(', ')})` : '1 = 0');
    params.push(...access.ids);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

export function createSeccionesRepository(poolProvider = getPool) {
  const repository = {
    update(id, actorId, decide, getToday) {
      return updateSection(poolProvider(), repository.assignmentContext, id, actorId, decide, getToday);
    },
    async matchForImport(records, yearId, level, access) {
      if (!records.length) return [];
      const where = conditions({ anio_escolar_id: yearId, nivel: level }, access);
      const [rows] = await poolProvider().execute(`SELECT j.source_index, ${columns} FROM JSON_TABLE(?, '$[*]' COLUMNS(
        source_index INT PATH '$.index', grado INT PATH '$.grado', letra VARCHAR(30) PATH '$.letra')) j
        JOIN secciones s ON s.grado = j.grado AND s.letra = j.letra COLLATE utf8mb4_0900_ai_ci ${where.sql} ORDER BY j.source_index`,
      [JSON.stringify(records), ...where.params]);
      return rows.map(row => ({ ...row, id: String(row.id), anio_escolar_id: String(row.anio_escolar_id) }));
    },
    async assignmentContext(id, connection) {
      // Localizar el año sin bloquear sección antes que año. La decisión usa lecturas actuales.
      const [locations] = await connection.execute('SELECT anio_escolar_id FROM secciones WHERE id = ? LIMIT 1', [id]);
      if (!locations[0]) return { section: null, year: null };
      const yearId = String(locations[0].anio_escolar_id);
      const [years] = await connection.execute(
        'SELECT id, estado, fecha_inicio, fecha_fin FROM anios_escolares WHERE id = ? LIMIT 1 FOR UPDATE', [yearId],
      );
      const [sections] = await connection.execute(`SELECT ${columns} FROM secciones s WHERE s.id = ? LIMIT 1 FOR UPDATE`, [id]);
      const section = sections[0] ?? null;
      if (section && String(section.anio_escolar_id) !== yearId) throw new Error('La sección cambió de año durante la operación.');
      return { section, year: years[0] ?? null };
    },
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
      return repository.createBatch([data], actorId, decide, false).then(rows => rows[0]);
    },
    createBatch(items, actorId, decide, checkDuplicates = true) {
      const data = items[0];
      return inTransaction(poolProvider(), async connection => {
        // Orden de escritura: actor, año; sin adquirir otros usuarios después.
        const [actors] = await connection.execute(
          'SELECT id, rol, activo, debe_cambiar_password, nivel_asignado FROM usuarios WHERE id = ? LIMIT 1 FOR UPDATE', [actorId],
        );
        assertPasswordChanged(actors[0]);
        const [years] = await connection.execute(
          'SELECT id, estado FROM anios_escolares WHERE id = ? LIMIT 1 FOR UPDATE', [data.anio_escolar_id],
        );
        await decide(actors[0] ?? null, years[0] ?? null, connection);
        if (checkDuplicates) {
          const [duplicates] = await connection.execute(`SELECT letra FROM secciones
            WHERE anio_escolar_id = ? AND nivel = ? AND grado = ? AND letra IN (${items.map(() => '?').join(', ')})
            ORDER BY letra FOR UPDATE`, [data.anio_escolar_id, data.nivel, data.grado, ...items.map(item => item.letra)]);
          if (duplicates.length) throw new HttpError(409,
            `Ya existen las secciones: ${duplicates.map(row => `${data.grado} ${row.letra}`).join(', ')}. No se creó ninguna sección del lote.`);
        }
        const created = [];
        for (const data of items) {
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
          created.push(row);
        }
        return created;
      });
    },
  };
  return repository;
}
