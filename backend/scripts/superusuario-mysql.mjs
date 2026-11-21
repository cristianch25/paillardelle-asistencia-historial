import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, profileOf, superuserActivation, openVerified, verifyOwnedProcess,
  shutdownVerified, assertRunnerGrants } from '../test-support/matriculas-mysql-safety.js';
import { assertUserSchema, fingerprint } from '../test-support/superusuario-mysql-schema.js';
import { prepareBase, resumeBase, upgrade, marker, readRecord, adminCredentials, runnerCredentials } from './lib/superusuario-mysql-prepare.js';

const backend = fileURLToPath(new URL('../', import.meta.url));
export function suiteEnvironment(manifest, runner, source = process.env) {
  // Lista cerrada: sin NODE_OPTIONS, SIAGIE, credenciales root, activación de matrículas ni DB heredadas.
  const env = Object.fromEntries(Object.entries(source).filter(([key]) =>
    /^(SystemRoot|WINDIR|PATH|PATHEXT|TEMP|TMP|USERPROFILE|COMSPEC)$/i.test(key)));
  return { ...env, SUPERUSUARIO_MYSQL_ENABLE: superuserActivation, SUPERUSUARIO_MYSQL_RUN: manifest.run,
    SUPERUSUARIO_MYSQL_PASSWORD: runner.password, DB_HOST: '127.0.0.1', DB_PORT: '3312',
    DB_NAME: manifest.schema, DB_USER: runner.user, DB_PASSWORD: runner.password };
}
export async function verifyReady(manifest) {
  const record = await readRecord(manifest, 'ready.json', 8);
  const c = await openVerified(manifest, runnerCredentials());
  try {
    assertRunnerGrants((await c.query('SHOW GRANTS'))[0], manifest);
    await assertUserSchema(c, 8);
    assert.deepEqual(await fingerprint(c), record.baseline, 'El escenario ya contiene cambios; no reutilizar.');
  } finally { await c.end(); }
}
export async function main(args = process.argv.slice(2), {
  manifestLoader = loadManifest, verifyProcess = verifyOwnedProcess, shutdown = shutdownVerified,
} = {}) {
  const [action, run, approval, ...extra] = args;
  assert.equal(approval, '--allow-temporary-mysql-3312');
  if (action === 'resume-base') assert.match(extra[0] ?? '', /^--expected-uuid=[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(extra.length, action === 'resume-base' ? 1 : 0);
  assert.ok(['prepare', 'resume-base', 'upgrade', 'verify-server', 'verify', 'run', 'shutdown'].includes(action));
  const manifest = await manifestLoader(run, 'superusuario');
  assert.equal(profileOf(manifest), 'superusuario');
  await verifyProcess(manifest);
  if (action === 'shutdown') return shutdown(manifest, adminCredentials());
  if (action === 'prepare') return prepareBase(manifest);
  if (action === 'resume-base') return resumeBase(manifest, extra[0].slice('--expected-uuid='.length));
  if (action === 'upgrade') return upgrade(manifest);
  if (action === 'verify-server') {
    const c = await openVerified(manifest, adminCredentials(), null);
    await c.end(); return;
  }
  await verifyReady(manifest);
  if (action === 'verify') return;
  await marker(manifest, 'suite.lock');
  const env = suiteEnvironment(manifest, runnerCredentials());
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'integration/superusuario.mysql.js'],
    { cwd: backend, env, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  assert.equal(code, 0, 'Suite fallida; conservar evidencia, no reintentar.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error('Ensayo SUPERUSUARIO detenido. Revisar identidad/estado; no reintentar automáticamente.');
  process.exitCode = 1;
});
