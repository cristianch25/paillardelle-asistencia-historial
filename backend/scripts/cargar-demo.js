import { getPool, readDatabaseConfig } from '../src/config/database.js';
import { assertLocal, assertPristine, assertResume, inspect } from './lib/demo-safety.js';
import { credentialsPath, manifestPath, readJson, lockDemo, saveState, createCredentials } from './lib/demo-files.js';
import { loadDemo } from './lib/demo-load.js';
import { summary } from './lib/demo-data.js';

let pool, unlock;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--apply', '--dry-run'].includes(arg))) throw new Error('Usa --dry-run (predeterminado) o --apply.');
  const apply = args[0] === '--apply';
  const config = readDatabaseConfig();
  // Rechazar un host remoto ANTES de abrir conexiones.
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host) || (process.env.NODE_ENV && process.env.NODE_ENV !== 'development')) {
    throw new Error('Solo se permite la base local de desarrollo.');
  }
  if (apply) unlock = await lockDemo();
  pool = getPool();
  const current = await inspect(pool);
  assertLocal(config, current.server);
  let state = await readJson(manifestPath), credentials = await readJson(credentialsPath);
  if (state) {
    assertResume(state, current);
    if (!credentials) throw new Error('Faltan las credenciales locales; no se recrean cuentas.');
  } else {
    if (credentials) throw new Error('Credenciales sin manifiesto; revisión manual requerida.');
    const [admins] = await pool.query('SELECT id, rol, activo FROM usuarios ORDER BY id');
    assertPristine(current.snapshot, admins[0]);
    state = { version: 1, ...current, adminId: String(admins[0].id), completed: {}, pending: null };
  }
  console.log(JSON.stringify({ modo: apply ? 'APLICAR' : 'SIMULACION', destino: current.server,
    registros_actuales: Object.fromEntries(Object.entries(current.snapshot).map(([table, rows]) => [table, rows.length])),
    propuesta: summary, pasos_completados: Object.keys(state.completed).length }, null, 2));
  if (apply) {
    if (!credentials) { credentials = await createCredentials(); await saveState(state); }
    await loadDemo(pool, state, credentials);
    console.log(JSON.stringify({ resultado: 'Carga completa; repetir no escribe datos.',
      anio_id: state.completed.year, secciones: Object.fromEntries(['ini', 'pri', 'sec'].map(key => [key, state.completed[`section-${key}`]])),
      credenciales: 'backend/tmp/demo-2026.credentials.json (local, ignorado por Git)' }, null, 2));
  }
} catch (error) {
  console.error(`Carga detenida: ${error.code ?? error.message}. Sin reintentos automáticos.`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
  if (unlock) await unlock();
}
