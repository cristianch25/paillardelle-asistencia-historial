import assert from 'node:assert/strict';
import { open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from '../../src/shared/passwords.js';
import { locations, password, openVerified } from '../../test-support/matriculas-mysql-safety.js';
import { sqlFiles, statements, digest, fingerprint, assertUserSchema, seedOriginalAccounts,
  fixturePassword, upgradeConnection } from '../../test-support/superusuario-mysql-schema.js';

export const directoryOf = manifest => locations(manifest.run, 'superusuario').directory;
export async function marker(manifest, name) {
  await (await open(path.join(directoryOf(manifest), name), 'wx')).close();
}
async function save(manifest, name, value) {
  await writeFile(path.join(directoryOf(manifest), name), JSON.stringify(value), { flag: 'wx' });
}
export async function readRecord(manifest, name, count) {
  const record = JSON.parse(await readFile(path.join(directoryOf(manifest), name), 'utf8'));
  assert.equal(record.uuid, manifest.uuid); assert.equal(record.schema, manifest.schema);
  assert.deepEqual(record.hashes, (await sqlFiles()).slice(0, count).map(digest));
  return record;
}
export const adminCredentials = () => ({ user: 'root', password: password(process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD) });
export const runnerCredentials = () => ({ user: 'superusuario_runner', password: password(process.env.SUPERUSUARIO_MYSQL_PASSWORD) });

export async function prepareBase(manifest) {
  const admin = adminCredentials(), runner = runnerCredentials(), files = await sqlFiles();
  assert.notEqual(admin.password, runner.password);
  await marker(manifest, 'prepare.lock');
  const server = await openVerified(manifest, admin, null);
  try {
    const [schemas] = await server.query('SHOW DATABASES');
    assert.ok(schemas.every(row => ['mysql', 'sys', 'performance_schema', 'information_schema'].includes(row.Database)), 'Instancia no vacía.');
    await server.query('CREATE DATABASE asistencia_paillardelle CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  } finally { await server.end(); }
  const c = await openVerified(manifest, admin);
  try {
    for (const sql of statements(files, 0, 6)) await c.query(sql);
    await assertUserSchema(c, 6);
    const [tables] = await c.query('SHOW TABLES'); assert.equal(tables.length, 20);
    for (const table of tables.map(row => Object.values(row)[0])) {
      assert.match(table, /^[a-z_]+$/);
      const [[row]] = await c.query(`SELECT COUNT(*) n FROM ${table}`);
      assert.equal(Number(row.n), table === 'configuracion_sistema' ? 2 : 0);
    }
    await seedOriginalAccounts(c, await hashPassword(fixturePassword));
    await c.query(`CREATE USER 'superusuario_runner'@'127.0.0.1' IDENTIFIED BY '${runner.password}'`);
    await c.query("GRANT SELECT, INSERT, UPDATE ON `asistencia\\_paillardelle`.* TO 'superusuario_runner'@'127.0.0.1'");
    await save(manifest, 'base.json', { uuid: manifest.uuid, schema: manifest.schema,
      hashes: files.slice(0, 6).map(digest), baseline: await fingerprint(c) });
  } finally { await c.end(); }
}
export async function upgrade(manifest) {
  const record = await readRecord(manifest, 'base.json', 6), files = await sqlFiles();
  await marker(manifest, 'upgrade.lock');
  const c = await openVerified(manifest, adminCredentials());
  try {
    await upgradeConnection(c, files, record.baseline);
    await save(manifest, 'ready.json', { ...record, hashes: files.map(digest) });
  } finally { await c.end(); }
}
