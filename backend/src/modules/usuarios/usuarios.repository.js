import { getPool } from '../../config/database.js';

// Selección explícita: nunca se consulta password_hash en este módulo.
const columns = `id, nombres, apellidos, usuario, rol, cargo, nivel_asignado,
  puede_escanear_qr, puede_usar_bitacora, activo, created_at, updated_at`;
const insertColumns = ['nombres', 'apellidos', 'usuario', 'password_hash', 'rol',
  'cargo', 'nivel_asignado', 'puede_escanear_qr', 'puede_usar_bitacora', 'activo'];

export function createUsuariosRepository(poolProvider = getPool) {
  return {
    async findByUsername(username) {
      const [rows] = await poolProvider().execute(
        'SELECT id FROM usuarios WHERE usuario = ? LIMIT 1', [username],
      );
      return rows[0] ?? null;
    },
    async create(data, actorId) {
      const connection = await poolProvider().getConnection();
      try {
        await connection.beginTransaction();
        // Los nombres de columnas provienen exclusivamente de esta lista interna.
        const fields = insertColumns.filter(field => Object.hasOwn(data, field));
        const [result] = await connection.execute(
          `INSERT INTO usuarios (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
          fields.map(field => data[field]),
        );
        if (result.affectedRows !== 1) throw new Error('No se creó un único usuario.');
        const [rows] = await connection.execute(
          `SELECT ${columns} FROM usuarios WHERE id = ? LIMIT 1`, [String(result.insertId)],
        );
        if (rows.length !== 1) throw new Error('No se pudo consultar el usuario creado.');
        const user = Object.fromEntries(columns.split(',').map(field => {
          const key = field.trim();
          return [key, rows[0][key]];
        }));
        await connection.execute(
          `INSERT INTO auditoria_administrativa
            (usuario_id, accion, entidad, registro_id, datos_anteriores, datos_nuevos)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [actorId, 'CREAR_USUARIO', 'usuarios', String(user.id), null, JSON.stringify(user)],
        );
        await connection.commit();
        return user;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async list({ limit, offset }) {
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM usuarios ORDER BY id ASC LIMIT ? OFFSET ?`,
        [limit, offset],
      );
      return rows;
    },
    async findById(id) {
      const [rows] = await poolProvider().execute(
        `SELECT ${columns} FROM usuarios WHERE id = ? LIMIT 1`, [id],
      );
      return rows[0] ?? null;
    },
  };
}
