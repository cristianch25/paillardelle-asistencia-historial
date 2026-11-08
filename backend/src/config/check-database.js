import { EXPECTED_DATABASE } from './database.js';

export async function checkDatabase(pool) {
  const [rows] = await pool.query('SELECT 1 AS ok, DATABASE() AS database_name');

  // MySQL puede tipar el literal como BIGINT: bigNumberStrings devuelve "1".
  const ok = rows[0]?.ok;
  if ((ok !== 1 && ok !== '1') || rows[0]?.database_name !== EXPECTED_DATABASE) {
    throw Object.assign(new Error('La conexión no corresponde a la base de datos esperada.'), {
      code: 'DB_CHECK_FAILED',
    });
  }
}
