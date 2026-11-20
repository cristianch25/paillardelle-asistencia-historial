import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const temporaryRoot = fileURLToPath(new URL('../tmp/', import.meta.url));
export const activation = 'MOVIMIENTOS_SINTETICOS_3312';
export function locations(run) {
  assert.match(run ?? '', /^[a-f0-9]{12}$/);
  const directory = path.resolve(temporaryRoot, `matriculas-mysql-${run}`);
  return { directory, datadir: path.join(directory, 'data'), schema: `matriculas_test_${run}` };
}
const normalize = value => path.resolve(value).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
export function validateManifest(manifest, run) {
  const expected = locations(run);
  assert.equal(manifest.kind, activation);
  assert.equal(manifest.run, run);
  assert.equal(manifest.host, '127.0.0.1');
  assert.equal(manifest.port, 3312);
  assert.equal(manifest.schema, expected.schema);
  assert.equal(normalize(manifest.datadir), normalize(expected.datadir));
  assert.match(manifest.uuid ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  return manifest;
}
export async function loadManifest(run) {
  const { directory, datadir } = locations(run);
  for (const entry of [temporaryRoot, directory, datadir, path.join(directory, 'manifest.json')]) {
    assert.equal((await lstat(entry)).isSymbolicLink(), false, 'No se admiten enlaces.');
    assert.equal(normalize(await realpath(entry)), normalize(entry), 'Ruta redirigida.');
  }
  const manifest = validateManifest(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')), run);
  const cnf = await readFile(path.join(datadir, 'auto.cnf'), 'utf8');
  assert.equal(cnf.match(/^server-uuid=(.+)$/m)?.[1].trim(), manifest.uuid);
  return manifest;
}
export function assertProcessIdentity(record, current, manifest) {
  validateManifest(manifest, manifest.run);
  assert.equal(record.run, manifest.run); assert.equal(record.uuid, manifest.uuid);
  assert.equal(record.host, manifest.host); assert.equal(record.port, manifest.port);
  assert.equal(normalize(record.datadir), normalize(manifest.datadir));
  assert.ok(Number.isInteger(record.pid) && record.pid > 0);
  assert.ok(Number.isFinite(Date.parse(record.created)));
  assert.equal(record.executable, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe');
  assert.ok(typeof record.commandLine === 'string' && record.commandLine.length > 0);
  for (const key of ['run', 'uuid', 'host', 'port', 'datadir', 'pid', 'created', 'executable', 'commandLine']) {
    assert.equal(current[key], record[key], `Identidad de lanzamiento distinta: ${key}`);
  }
}
export async function verifyOwnedProcess(manifest) {
  const launch = path.join(locations(manifest.run).directory, 'launch.json');
  assert.equal((await lstat(launch)).isSymbolicLink(), false);
  assert.equal(normalize(await realpath(launch)), normalize(launch));
  const record = JSON.parse(await readFile(launch, 'utf8'));
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const script = fileURLToPath(new URL('../scripts/matriculas-mysql.ps1', import.meta.url));
  const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-File', script,
    '-Action', 'verify-process', '-Run', manifest.run, '-Confirm3312'], { windowsHide: true, timeout: 10000 });
  const current = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  assertProcessIdentity(record, current, manifest);
  return current;
}
export async function shutdownVerified(manifest, credentials, { verifyProcess = verifyOwnedProcess, connect = openVerified } = {}) {
  const original = await verifyProcess(manifest);
  assertProcessIdentity(original, original, manifest);
  const c = await connect(manifest, credentials, null);
  try {
    assertProcessIdentity(original, await verifyProcess(manifest), manifest);
    await c.query('SHUTDOWN');
  } finally { c.destroy(); }
}
export function password(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(value)) {
    throw new Error('Se requiere contraseña temporal de 32–128 caracteres seguros.');
  }
  return value;
}
export function suiteEnabled(env) {
  return env.MATRICULAS_MYSQL_ENABLE === activation && /^[a-f0-9]{12}$/.test(env.MATRICULAS_MYSQL_RUN ?? '');
}
export function assertRunnerGrants(grants, manifest) {
  const rows = grants.map(row => Object.values(row)[0]);
  const schema = manifest.schema.replaceAll('_', '\\_');
  const account = 'TO `matriculas_runner`@`127.0.0.1`';
  assert.equal(rows.length, 2);
  assert.ok(rows.includes(`GRANT USAGE ON *.* ${account}`));
  assert.ok(rows.includes(`GRANT SELECT, INSERT, UPDATE ON \`${schema}\`.* ${account}`));
}
export function assertIdentity(row, manifest, database = manifest.schema) {
  validateManifest(manifest, manifest.run);
  assert.equal(Number(row.port), 3312);
  assert.equal(row.bind_address, '127.0.0.1');
  assert.equal(row.uuid, manifest.uuid);
  assert.equal(normalize(row.datadir), normalize(manifest.datadir));
  assert.equal(row.db, database);
  assert.match(row.version, /^8\.4\./);
}
// No usa .env ni acepta opciones de conexión suministradas por el llamador.
export async function openVerified(manifest, credentials, database = manifest.schema, connect = mysql.createConnection) {
  validateManifest(manifest, manifest.run);
  assert.ok(database === null || database === manifest.schema);
  assert.ok(['root', 'matriculas_runner'].includes(credentials.user));
  password(credentials.password);
  const raw = await connect({ host: '127.0.0.1', port: 3312, database: database ?? undefined,
    user: credentials.user, password: credentials.password, connectTimeout: 3000,
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, charset: 'utf8mb4',
    multipleStatements: false, enableKeepAlive: false });
  async function verify() {
    const [[row]] = await raw.query('SELECT @@port port, @@bind_address bind_address, @@server_uuid uuid, @@datadir datadir, DATABASE() db, VERSION() version');
    assertIdentity(row, manifest, database);
  }
  try { await verify(); } catch (error) { raw.destroy(); throw error; }
  return new Proxy(raw, { get(target, key) {
    if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].includes(key)) return async (...args) => {
      try { await verify(); } catch (error) { target.destroy(); throw error; }
      return target[key](...args);
    };
    if (['changeUser', 'config'].includes(key)) throw new Error('No se permite cambiar el destino.');
    if (key === 'release') return () => { target.end().catch(() => target.destroy()); };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
}
export function isolatedPool(manifest, credentials) {
  // Si un servicio olvidara inyectar su repositorio, el pool general rechaza este esquema.
  validateManifest(manifest, manifest.run); password(credentials.password);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3312', DB_NAME: manifest.schema,
    DB_USER: credentials.user, DB_PASSWORD: credentials.password });
  return { getConnection: () => openVerified(manifest, credentials), async execute(sql, params) {
    const c = await this.getConnection(); try { return await c.execute(sql, params); } finally { await c.end(); }
  } };
}

export function schemaStatements(base, migrations) {
  const clean = sql => sql.replace(/^\s*--[^\r\n]*/gm, '').trim();
  const statements = [base, ...migrations].flatMap(sql => clean(sql).split(';').map(s => s.trim()).filter(Boolean));
  assert.match(statements.shift(), /^CREATE DATABASE IF NOT EXISTS asistencia_paillardelle\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci$/);
  assert.equal(statements.shift(), 'USE asistencia_paillardelle');
  for (const sql of statements) {
    assert.match(sql, /^(CREATE TABLE|ALTER TABLE|INSERT INTO|SELECT)\b/);
    assert.doesNotMatch(sql, /\b(?:USE|OUTFILE|INFILE)\b|\/\*|`|\b(?:TABLE|INTO|REFERENCES)\s+[a-z_]+\s*\./i);
  }
  return statements;
}
