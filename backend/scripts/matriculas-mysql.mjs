import assert from 'node:assert/strict';
import { readFile, writeFile, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activation, loadManifest, locations, openVerified, password, schemaStatements, assertRunnerGrants, shutdownVerified } from '../test-support/matriculas-mysql-safety.js';

const backend = fileURLToPath(new URL('../', import.meta.url));
const sources = ['asistencia_paillardelle_mysql_v1.sql', 'migrations/002_inicial_supervision_multinivel.sql',
  'migrations/003_periodos_lectivos.sql', 'migrations/004_asistencia_diaria.sql',
  'migrations/005_justificacion_sencilla.sql', 'migrations/006_correccion_sin_motivo.sql'];
async function sqlSources() {
  return Promise.all(sources.map(file => readFile(new URL(`../../docs/database/${file}`, import.meta.url), 'utf8')));
}
async function ready(manifest) {
  const record = JSON.parse(await readFile(path.join(locations(manifest.run).directory, 'ready.json'), 'utf8'));
  assert.equal(record.uuid, manifest.uuid); assert.equal(record.schema, manifest.schema);
  const files = await sqlSources();
  assert.deepEqual(record.hashes, files.map(sql => createHash('sha256').update(sql).digest('hex')));
}
async function prepare(manifest) {
  const directory = locations(manifest.run).directory;
  const files = await sqlSources(), statements = schemaStatements(files[0], files.slice(1));
  const adminPassword = password(process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD);
  const runnerPassword = password(process.env.MATRICULAS_MYSQL_PASSWORD);
  assert.notEqual(adminPassword, runnerPassword);
  // Marcador exclusivo: un fallo DDL no permite continuar/reintentar una preparación parcial.
  await (await open(path.join(directory, 'prepare.lock'), 'wx')).close();
  const credentials = { user: 'root', password: adminPassword };
  const server = await openVerified(manifest, credentials, null);
  try {
    const [schemas] = await server.query('SHOW DATABASES');
    assert.ok(schemas.every(row => ['mysql', 'sys', 'performance_schema', 'information_schema'].includes(row.Database)), 'Instancia no vacía.');
    await server.query(`CREATE DATABASE ${manifest.schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally { await server.end(); }
  const c = await openVerified(manifest, credentials);
  try {
    for (const sql of statements) await c.query(sql);
    const [tables] = await c.query('SHOW TABLES'); assert.equal(tables.length, 20);
    for (const row of tables) {
      const table = Object.values(row)[0]; assert.match(table, /^[a-z_]+$/);
      const [[count]] = await c.query(`SELECT COUNT(*) n FROM ${table}`);
      assert.equal(Number(count.n), table === 'configuracion_sistema' ? 2 : 0);
    }
    // Credenciales solo del entorno; no imprimir SQL ni errores que puedan contenerlo.
    await c.query(`CREATE USER 'matriculas_runner'@'127.0.0.1' IDENTIFIED BY '${runnerPassword}'`);
    // Sin comodines de esquema en GRANT: escapar los guiones bajos del nombre.
    const grantSchema = manifest.schema.replaceAll('_', '\\_');
    await c.query(`GRANT SELECT, INSERT, UPDATE ON \`${grantSchema}\`.* TO 'matriculas_runner'@'127.0.0.1'`);
    await writeFile(path.join(directory, 'ready.json'), JSON.stringify({ uuid: manifest.uuid, schema: manifest.schema,
      hashes: files.map(sql => createHash('sha256').update(sql).digest('hex')) }), { flag: 'wx' });
  } finally { await c.end(); }
}
export async function main(args = process.argv.slice(2), { manifestLoader = loadManifest, shutdown = shutdownVerified } = {}) {
  const [action, run, approval, ...extra] = args;
  assert.equal(approval, '--allow-temporary-mysql-3312'); assert.equal(extra.length, 0);
  assert.ok(['prepare', 'verify', 'verify-server', 'run', 'shutdown'].includes(action));
  const manifest = await manifestLoader(run);
  if (action === 'shutdown') return shutdown(manifest, { user: 'root', password: password(process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD) });
  if (action === 'prepare') return prepare(manifest);
  if (action === 'run') {
    await ready(manifest);
    password(process.env.MATRICULAS_MYSQL_PASSWORD);
    await (await open(path.join(locations(run).directory, 'suite.lock'), 'wx')).close();
    const env = { ...process.env, MATRICULAS_MYSQL_ENABLE: activation, MATRICULAS_MYSQL_RUN: run,
      DB_HOST: '127.0.0.1', DB_PORT: '3312', DB_NAME: manifest.schema,
      DB_USER: 'matriculas_runner', DB_PASSWORD: process.env.MATRICULAS_MYSQL_PASSWORD };
    delete env.MATRICULAS_MYSQL_ADMIN_PASSWORD;
    delete env.SIAGIE_MYSQL_DATABASE;
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'integration/matriculas.mysql.js'],
      { cwd: backend, env, stdio: 'inherit', windowsHide: true });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0, 'Suite fallida; conservar evidencia.'); return;
  }
  const admin = action === 'verify-server';
  if (!admin) await ready(manifest);
  const c = await openVerified(manifest, { user: admin ? 'root' : 'matriculas_runner',
    password: password(process.env[admin ? 'MATRICULAS_MYSQL_ADMIN_PASSWORD' : 'MATRICULAS_MYSQL_PASSWORD']) }, admin ? null : manifest.schema);
  try {
    if (action === 'verify') {
      const [tables] = await c.query('SHOW TABLES'); assert.equal(tables.length, 20);
      const [grants] = await c.query('SHOW GRANTS');
      assertRunnerGrants(grants, manifest);
      console.log('Identidad, esquema y preparación verificados; revisar también proceso/listener con PowerShell.');
    }
  } finally { await c.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`Operación temporal detenida (${error.code ?? error.name}). No reintentar una preparación parcial.`);
  process.exitCode = 1;
});
