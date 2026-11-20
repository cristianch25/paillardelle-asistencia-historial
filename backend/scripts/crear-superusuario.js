import { createInterface } from 'node:readline/promises';
import { hostname, userInfo } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { readDatabaseConfig } from '../src/config/database.js';
import { isValidPassword } from '../src/shared/passwords.js';
import { readHiddenPassword } from './lib/local-password.js';
import { initializeSuperuser, validateInitialIdentity } from './lib/superusuario-inicial.js';
import { assertSuperuserSchema, inspectSuperuserTarget, localFailure,
  targetConfirmation, validateExpectedUuid } from './lib/superusuario-target.js';

async function askText(label, input, output) {
  const terminal = createInterface({ input, output, terminal: true });
  try {
    return await new Promise((resolveAnswer, reject) => {
      terminal.once('SIGINT', () => reject(localFailure('LOCAL_INPUT_CANCELLED')));
      terminal.once('close', () => reject(localFailure('LOCAL_INPUT_CANCELLED')));
      terminal.question(label).then(resolveAnswer, reject);
    });
  } finally { terminal.close(); }
}

const messages = {
  LOCAL_TERMINAL_REQUIRED: 'Usa una terminal local interactiva, sin redirecciones.',
  LOCAL_ARGUMENTS_FORBIDDEN: 'Esta herramienta no admite argumentos; los datos se solicitan en la terminal.',
  LOCAL_INPUT_CANCELLED: 'Operación cancelada.',
  LOCAL_TARGET_INVALID: 'Indica un UUID de instancia esperado válido, obtenido previamente por un canal autorizado.',
  LOCAL_TARGET_MISMATCH: 'La instancia, el puerto, la base o la versión no coinciden con el destino esperado.',
  LOCAL_SCHEMA_UNSUPPORTED: 'Esquema incompatible. Requiere 007 aplicada y las restricciones originales; no se ejecutará DDL.',
  LOCAL_CONFIRMATION_REQUIRED: 'No se recibió la confirmación exacta del destino.',
  LOCAL_IDENTITY_INVALID: 'Nombres, apellidos o identificador de cuenta inválidos.',
  LOCAL_EXECUTOR_INVALID: 'No se pudo identificar al ejecutor local.',
  LOCAL_PASSWORD_INVALID: 'La contraseña debe ocupar entre 1 y 72 bytes UTF-8.',
  LOCAL_PASSWORD_MISMATCH: 'Las contraseñas no coinciden.',
  LOCAL_INITIALIZATION_BUSY: 'Otra inicialización mantiene el bloqueo; no se reintenta.',
  LOCAL_LOCK_FAILED: 'No se pudo verificar el bloqueo de inicialización; se descarta la conexión.',
  LOCAL_SUPERUSER_EXISTS: 'Ya existe SUPERUSUARIO, activo o inactivo. Esta herramienta no recupera ni modifica cuentas.',
  LOCAL_USERNAME_EXISTS: 'El identificador ya existe; no se sobrescribe.',
  ER_DUP_ENTRY: 'Identificador duplicado; no se sobrescribe ni se reintenta.',
  LOCAL_CLEANUP_FAILED: 'No se completó la liberación de recursos.',
};

export function describeInitializationError(error) {
  return Object.hasOwn(messages, error?.code) ? messages[error.code]
    : 'No se pudo completar la inicialización. Diagnóstico manual requerido.';
}

export async function runLocalSuperuser({ input = process.stdin, output = process.stdout,
  args = process.argv.slice(2), readConfig = readDatabaseConfig,
  openPool = config => mysql.createPool({ ...config, connectionLimit: 1 }),
  ask = askText, readSecret = readHiddenPassword, initialize = initializeSuperuser,
  getExecutor = () => ({ usuario_so: userInfo().username, equipo: hostname() }) } = {}) {
  if (args.length) throw localFailure('LOCAL_ARGUMENTS_FORBIDDEN');
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') throw localFailure('LOCAL_TERMINAL_REQUIRED');
  let pool, connection, password, confirmation, handedOver = false, failed = false;
  try {
    const config = readConfig();
    const uuid = validateExpectedUuid(await ask('UUID esperado de la instancia (verificado previamente): ', input, output));
    pool = openPool(config);
    connection = await pool.getConnection();
    const target = await inspectSuperuserTarget(connection, config, uuid);
    await assertSuperuserSchema(connection);
    output.write(`Destino verificado: ${JSON.stringify(target)}\n`);
    const identity = validateInitialIdentity({
      nombres: await ask('Nombres del titular: ', input, output),
      apellidos: await ask('Apellidos del titular: ', input, output),
      usuario: await ask('Identificador de la cuenta: ', input, output),
    });
    const phrase = targetConfirmation(target);
    output.write(`Para autorizar esta única alta inicial escribe exactamente:\n${phrase}\n`);
    if (await ask('Confirmación: ', input, output) !== phrase) throw localFailure('LOCAL_CONFIRMATION_REQUIRED');
    password = await readSecret('Contraseña (oculta): ', input, output);
    confirmation = await readSecret('Repite la contraseña (oculta): ', input, output);
    if (!isValidPassword(password)) throw localFailure('LOCAL_PASSWORD_INVALID');
    if (password !== confirmation) throw localFailure('LOCAL_PASSWORD_MISMATCH');
    confirmation = undefined;
    const executor = getExecutor();
    handedOver = true;
    return await initialize(connection, { identity, password, executor, target });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // Libera referencias; JavaScript no garantiza borrado físico de cadenas.
    password = undefined;
    confirmation = undefined;
    let cleanupFailed = false;
    if (connection && !handedOver) {
      try { connection.release(); } catch {
        cleanupFailed = true;
        try { connection.destroy(); } catch { /* No exponer errores internos. */ }
      }
    }
    if (pool) try { await pool.end(); } catch { cleanupFailed = true; }
    if (cleanupFailed && !failed) throw localFailure('LOCAL_CLEANUP_FAILED');
  }
}

// Importar desde pruebas o módulos no abre conexiones ni ejecuta el alta.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const id = await runLocalSuperuser();
    console.log(`Alta inicial confirmada: SUPERUSUARIO ID ${id}, con auditoría local en la misma transacción.`);
  } catch (error) {
    console.error(describeInitializationError(error));
    console.error('No se confirmó el resultado de la creación. Si hubo COMMIT o pérdida de conexión, puede ser incierto; no reintentes automáticamente.');
    process.exitCode = 1;
  }
}
