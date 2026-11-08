import { getPool } from '../src/config/database.js';
import { checkDatabase } from '../src/config/check-database.js';
import { describeDatabaseError } from '../src/config/database-errors.js';

let pool;

try {
  pool = getPool();
  await checkDatabase(pool);
  console.log('Conexión MySQL verificada: SELECT 1 correcto y base esperada seleccionada.');
} catch (error) {
  console.error(describeDatabaseError(error));
  process.exitCode = 1;
} finally {
  if (pool) {
    try {
      await pool.end();
    } catch (error) {
      console.error(describeDatabaseError(error));
      process.exitCode = 1;
    }
  }
}
