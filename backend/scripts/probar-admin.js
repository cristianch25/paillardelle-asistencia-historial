import app from '../src/app.js';
import { getPool } from '../src/config/database.js';
import { checkDatabase } from '../src/config/check-database.js';
import { describeDatabaseError } from '../src/config/database-errors.js';
import { readAuthConfig } from '../src/modules/auth/auth.tokens.js';
import { readHiddenPassword } from './lib/local-password.js';
import { assertAdminAbsent, insertTestAdmin } from './lib/admin-prueba.js';
import { probeAuthentication } from './lib/auth-probe.js';

const safeMessages = {
  LOCAL_TERMINAL_REQUIRED: 'Ejecuta este archivo en tu terminal local interactiva, sin redirecciones.',
  LOCAL_INPUT_CANCELLED: 'Entrada cancelada. No se ha solicitado ninguna inserción.',
  TEST_PASSWORD_INVALID: 'La contraseña debe ocupar entre 1 y 72 bytes UTF-8.',
  TEST_PASSWORD_MISMATCH: 'Las contraseñas no coinciden. No se ha solicitado ninguna inserción.',
  TEST_ADMIN_EXISTS: 'admin_prueba ya existe. Se detuvo la operación sin modificarlo.',
  ER_DUP_ENTRY: 'El identificador ya existe. No se sobrescribió ningún usuario.',
  TEST_HASH_FAILED: 'No se pudo verificar el hash generado.',
  TEST_INSERT_FAILED: 'El registro no superó la validación de la transacción.',
  TEST_LOGIN_FAILED: 'La prueba de login no devolvió la respuesta esperada.',
  TEST_ME_FAILED: 'La prueba de perfil no devolvió la respuesta esperada.',
  TEST_401_FAILED: 'Una prueba negativa no devolvió 401.',
};

let pool;
let connection;
let password;
let confirmation;
let committed = false;

try {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw Object.assign(new Error(), { code: 'LOCAL_TERMINAL_REQUIRED' });
  }
  readAuthConfig(); // No crear el usuario si la autenticación no está configurada.
  pool = getPool();
  await checkDatabase(pool);
  connection = await pool.getConnection();
  await assertAdminAbsent(connection);
  console.log('Único usuario autorizado: Administrador Prueba / admin_prueba / ADMIN.');
  password = await readHiddenPassword('Contraseña (entrada oculta): ');
  confirmation = await readHiddenPassword('Repite la contraseña (entrada oculta): ');
  if (password !== confirmation) {
    throw Object.assign(new Error(), { code: 'TEST_PASSWORD_MISMATCH' });
  }
  confirmation = undefined;
  const id = await insertTestAdmin(connection, password);
  committed = true;
  connection.release();
  connection = undefined;
  console.log('Creado únicamente admin_prueba. Transacción confirmada.');
  await probeAuthentication(app, password, id);
  console.log('Pruebas completadas. No se realizarán operaciones adicionales.');
} catch (error) {
  if (error.status === 503) {
    console.error('AUTH_CONFIG_INVALID: Revisa la configuración JWT antes de crear el usuario.');
  } else if (Object.hasOwn(safeMessages, error.code)) {
    console.error(`${error.code}: ${safeMessages[error.code]}`);
  } else {
    console.error(describeDatabaseError(error));
  }
  if (committed) {
    console.error('admin_prueba ya fue creado; no se elimina ni modifica. Detente y comunica solo el diagnóstico seguro.');
  } else {
    console.error('No se confirmó la creación. No reintentes automáticamente si hubo un fallo al confirmar la transacción.');
  }
  process.exitCode = 1;
} finally {
  // Se liberan referencias; JavaScript no garantiza borrado físico de cadenas en memoria.
  password = undefined;
  confirmation = undefined;
  if (connection) connection.release();
  if (pool) {
    await pool.end().catch(() => {
      console.error('POOL_CLOSE_FAILED: No se pudo cerrar el pool.');
      process.exitCode = 1;
    });
  }
}
