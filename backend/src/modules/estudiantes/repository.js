import { getPool } from '../../config/database.js';
import { readInsertedId } from '../../shared/inserted-id.js';

const fields = ['codigo_estudiante', 'tipo_documento', 'numero_documento', 'apellido_paterno',
  'apellido_materno', 'nombres', 'fecha_nacimiento'];
const columns = ['id', ...fields, 'created_at', 'updated_at'].join(', ');
function publicRow(row) { return row ? { ...row, id: String(row.id) } : null; }
export function createStudentsRepository(poolProvider = getPool, lockImport = false) {
  return {
    async matchImportIdentities(records) {
      if (!records.length) return { matches: [], duplicates: [] };
      const input = JSON.stringify(records);
      const incoming = `WITH incoming AS (SELECT j.source_index, j.codigo COLLATE utf8mb4_0900_ai_ci AS codigo,
        j.tipo COLLATE utf8mb4_0900_ai_ci AS tipo, j.numero COLLATE utf8mb4_0900_ai_ci AS numero
        FROM JSON_TABLE(?, '$[*]' COLUMNS(
        source_index INT PATH '$.index', codigo VARCHAR(30) PATH '$.codigo',
        tipo VARCHAR(15) PATH '$.tipo', numero VARCHAR(20) PATH '$.numero')) j)`;
      const same = (a, b) => `(${a}.codigo IS NOT NULL AND ${a}.codigo COLLATE utf8mb4_0900_ai_ci = ${b}.codigo COLLATE utf8mb4_0900_ai_ci)
        OR (${a}.tipo IS NOT NULL AND ${a}.numero IS NOT NULL AND ${a}.tipo = ${b}.tipo AND ${a}.numero = ${b}.numero)`;
      const [matches] = await poolProvider().execute(`${incoming}
        SELECT i.source_index, e.id, e.codigo_estudiante, e.tipo_documento, e.numero_documento,
          e.apellido_paterno, e.apellido_materno, e.nombres,
          (e.codigo_estudiante = i.codigo) AS coincide_codigo,
          (e.tipo_documento = i.tipo AND e.numero_documento = i.numero) AS coincide_documento
        FROM incoming i JOIN estudiantes e ON (i.codigo IS NOT NULL AND e.codigo_estudiante = i.codigo)
          OR (i.tipo IS NOT NULL AND i.numero IS NOT NULL AND e.tipo_documento = i.tipo AND e.numero_documento = i.numero)
        ORDER BY i.source_index, e.id${lockImport ? ' FOR UPDATE' : ''}`, [input]);
      // EXISTS limita el resultado a 2.000 índices incluso si todas las filas se repiten.
      const [duplicates] = await poolProvider().execute(`${incoming} SELECT i.source_index FROM incoming i
        WHERE EXISTS (SELECT 1 FROM incoming j WHERE i.source_index <> j.source_index AND (${same('i', 'j')}))
        ORDER BY i.source_index`, [input]);
      return { matches: matches.map(row => ({ ...row, id: String(row.id), source_index: Number(row.source_index),
        coincide_codigo: Number(row.coincide_codigo) === 1, coincide_documento: Number(row.coincide_documento) === 1 })),
        duplicates: duplicates.map(row => Number(row.source_index)) };
    },
    async find(id, connection = poolProvider(), lock = false) {
      const [rows] = await connection.execute(
        `SELECT ${columns} FROM estudiantes WHERE id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [id]);
      return publicRow(rows[0]);
    },
    async insert(data, actorId, connection) {
      const [result] = await connection.execute(
        `INSERT INTO estudiantes (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
        fields.map(key => data[key]));
      if (result.affectedRows !== 1) throw new Error('No se creó un único estudiante.');
      const id = await readInsertedId(connection);
      const row = await this.find(id, connection);
      if (!row) throw new Error('No se pudo consultar el estudiante creado.');
      await connection.execute(`INSERT INTO auditoria_administrativa
        (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos) VALUES (?, ?, ?, ?, ?, ?)`,
      [actorId, 'CREAR_ESTUDIANTE', 'estudiantes', id, null, JSON.stringify(row)]);
      return row;
    },
    async list({ ids, estudiante_id, limit, offset }) {
      if (ids?.length === 0) return [];
      const clauses = [], params = [];
      if (ids) { clauses.push(`id IN (${ids.map(() => '?').join(', ')})`); params.push(...ids); }
      if (estudiante_id) { clauses.push('id = ?'); params.push(estudiante_id); }
      const [rows] = await poolProvider().execute(`SELECT ${columns} FROM estudiantes
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY id ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]);
      return rows.map(publicRow);
    },
    async possibleDuplicates(data, ids, connection) {
      if (ids?.length === 0) return false;
      // Aviso sin datos personales ni identificadores de coincidencias fuera del ámbito.
      const [rows] = await connection.execute(`SELECT id FROM estudiantes
        WHERE apellido_paterno = ? AND nombres = ? AND apellido_materno <=> ?
        ${ids ? `AND id IN (${ids.map(() => '?').join(', ')})` : ''} LIMIT 1`,
      [data.apellido_paterno, data.nombres, data.apellido_materno, ...(ids ?? [])]);
      return rows.length > 0;
    },
  };
}
