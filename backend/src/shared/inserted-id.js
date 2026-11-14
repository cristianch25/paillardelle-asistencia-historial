import { validateId } from './query-validation.js';

export async function readInsertedId(connection) {
  const [rows] = await connection.execute('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
  const id = rows[0]?.id;
  try { validateId(id); } catch { throw new Error('No se pudo recuperar el ID insertado como texto unsigned.'); }
  return id;
}
