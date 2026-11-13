import { getPool } from '../../config/database.js';
import { readInsertedId } from '../../shared/inserted-id.js';

const fields = ['codigo_estudiante', 'tipo_documento', 'numero_documento', 'apellido_paterno',
  'apellido_materno', 'nombres', 'fecha_nacimiento'];
const columns = ['id', ...fields, 'created_at', 'updated_at'].join(', ');
function publicRow(row) { return row ? { ...row, id: String(row.id) } : null; }
export function createStudentsRepository(poolProvider = getPool) {
  return {
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
