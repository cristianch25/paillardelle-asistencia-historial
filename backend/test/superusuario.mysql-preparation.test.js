import assert from 'node:assert/strict';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { main, suiteEnvironment } from '../scripts/superusuario-mysql.mjs';
import { locations, superuserActivation, activation, validateManifest, openVerified, assertRunnerGrants, assertIdentity } from '../test-support/matriculas-mysql-safety.js';
import { installConnectionFence, suiteEnabled } from '../test-support/superusuario-mysql-runtime.js';
import { sqlFiles, statements, assertUserSchema, seedOriginalAccounts, originalNames } from '../test-support/superusuario-mysql-schema.js';

const run = 'aabbcc112233';
const manifest = { run, kind: superuserActivation, ...locations(run, 'superusuario'),
  uuid: '12345678-1234-1234-1234-123456789abc', host: '127.0.0.1', port: 3312 };
const credentials = { user: 'superusuario_runner', password: 'a'.repeat(40) };
test('perfil propio: nombre canónico solo con datadir y kind SUPERUSUARIO', () => {
  assert.doesNotThrow(() => validateManifest(manifest, run));
  for (const patch of [{ kind: activation }, { datadir: locations(run).datadir }, { schema: locations(run).schema },
    { host: 'localhost' }, { port: 3306 }, { port: 3310 }, { port: 3311 }]) {
    assert.throws(() => validateManifest({ ...manifest, ...patch }, run));
  }
  assert.equal(suiteEnabled({}), false);
  assert.equal(suiteEnabled({ MATRICULAS_MYSQL_ENABLE: activation, MATRICULAS_MYSQL_RUN: run }), false);
  assert.equal(suiteEnabled({ SUPERUSUARIO_MYSQL_ENABLE: superuserActivation, SUPERUSUARIO_MYSQL_RUN: run }), true);
});
test('secuencia v1–008: 007 repone el CHECK exacto en un único ALTER; 008 independiente', async () => {
  const files = await sqlFiles();
  assert.equal(files.length, 8); assert.equal(statements(files, 0, 6).filter(sql => sql.startsWith('CREATE TABLE')).length, 20);
  const seven = statements(files, 6, 7), eight = statements(files, 7, 8);
  assert.equal(seven.length, 1); assert.equal(eight.length, 1);
  assert.match(seven[0], /^ALTER TABLE usuarios\s+DROP CHECK chk_usuario_nivel,/);
  assert.match(seven[0], /ADD CONSTRAINT chk_usuario_nivel CHECK \(rol <> 'SUBDIRECCION' OR nivel_asignado IS NOT NULL\)$/);
  assert.match(eight[0], /ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE$/);
  assert.equal(statements(files).length, statements(files, 0, 6).length + 2);
});
test('proceso no verificable impide conectar incluso con nombre de base correcto', async () => {
  let connected = false;
  await assert.rejects(openVerified(manifest, credentials, manifest.schema,
    async () => { connected = true; }, async () => { throw new Error('PID ajeno'); }), /PID ajeno/);
  assert.equal(connected, false);
});
test('SUPERUSUARIO rechaza modo no estricto y FK deshabilitadas', () => {
  const identity = { port: 3312, bind_address: '127.0.0.1', uuid: manifest.uuid, datadir: manifest.datadir,
    db: manifest.schema, version: '8.4.13', sql_mode: 'STRICT_TRANS_TABLES', fk_checks: 1 };
  assert.doesNotThrow(() => assertIdentity(identity, manifest));
  for (const patch of [{ sql_mode: '' }, { fk_checks: 0 }, { uuid: 'otro' }]) {
    assert.throws(() => assertIdentity({ ...identity, ...patch }, manifest));
  }
});
test('revalida SQL antes de cada operación y descarta UUID o datadir distintos', async () => {
  let current = { port: 3312, bind_address: '127.0.0.1', uuid: manifest.uuid,
    datadir: manifest.datadir, db: manifest.schema, version: '8.4.13', sql_mode: 'STRICT_TRANS_TABLES', fk_checks: 1 }, destroyed = false, writes = 0, checked = 0;
  const c = await openVerified(manifest, credentials, manifest.schema, async options => {
    assert.equal(options.port, 3312); assert.equal(options.host, '127.0.0.1');
    return { query: async () => [[current]], execute: async () => { writes++; return [{}]; },
      commit: async () => { writes++; }, destroy: () => { destroyed = true; } };
  }, async () => { checked++; });
  await c.execute('SELECT 1'); current = { ...current, datadir: 'C:/ajeno' };
  await assert.rejects(c.execute('INSERT INTO usuarios VALUES(1)')); await assert.rejects(c.commit());
  assert.equal(writes, 1); assert.equal(destroyed, true); assert.equal(checked, 1);
});
test('CLI rechaza activación incompleta y perfil matrícula antes de verificar procesos', async () => {
  let loaded = false, verified = false;
  await assert.rejects(main(['run', run], { manifestLoader: async () => { loaded = true; } }));
  assert.equal(loaded, false);
  await assert.rejects(main(['run', run, '--allow-temporary-mysql-3312'], {
    manifestLoader: async () => ({ ...manifest, kind: activation }), verifyProcess: async () => { verified = true; },
  }));
  assert.equal(verified, false);
});
test('entorno hijo cerrado: sin .env heredado, root, JWT ni activación de otras suites', () => {
  const env = suiteEnvironment(manifest, credentials, { PATH: 'ruta', DB_HOST: 'principal', DB_PORT: '3306',
    DB_NAME: 'otro', MATRICULAS_MYSQL_ADMIN_PASSWORD: 'no-transmitir', SIAGIE_MYSQL_DATABASE: 'otro',
    NODE_OPTIONS: '--import ajeno', AUTH_JWT_SECRET: 'no-compartir' });
  assert.equal(env.DB_HOST, '127.0.0.1'); assert.equal(env.DB_PORT, '3312'); assert.equal(env.DB_NAME, manifest.schema);
  for (const key of ['NODE_OPTIONS', 'MATRICULAS_MYSQL_ADMIN_PASSWORD', 'SIAGIE_MYSQL_DATABASE', 'AUTH_JWT_SECRET']) assert.equal(env[key], undefined);
});
test('fábricas generales bloqueadas aun cuando DB_NAME canónico sería aceptado por producción', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, suiteEnvironment(manifest, credentials));
    const fence = installConnectionFence(manifest, credentials);
    try { assert.throws(() => mysql.createPool({}), /fuera del pool/); assert.throws(() => mysql.createConnection({}), /fuera del pool/); }
    finally { fence.restore(); }
  } finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
});
test('runner SUPERUSUARIO: privilegios exactos, sin DDL, DELETE ni comodines', () => {
  const account = 'TO `superusuario_runner`@`127.0.0.1`';
  const usage = { grant: `GRANT USAGE ON *.* ${account}` };
  const grant = `GRANT SELECT, INSERT, UPDATE ON \`asistencia\\_paillardelle\`.* ${account}`;
  assert.doesNotThrow(() => assertRunnerGrants([usage, { grant }], manifest));
  for (const wrong of [grant.replace('UPDATE', 'UPDATE, DELETE'), grant.replace('\\_', '_'), grant + ' WITH GRANT OPTION']) {
    assert.throws(() => assertRunnerGrants([usage, { grant: wrong }], manifest));
  }
});
test('fixtures propios anteriores a 007: tres roles, inactivo, sin SUPERUSUARIO', async () => {
  const calls = [];
  await seedOriginalAccounts({ execute: async (sql, params) => { calls.push({ sql, params }); } }, 'HASH_SOLO_MOCK');
  assert.deepEqual(calls.map(call => call.params[0]), originalNames);
  assert.deepEqual(calls.map(call => call.params[2]), ['ADMIN', 'ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'ADMIN']);
  assert.equal(calls[2].params[3], 'PRIMARIA'); assert.equal(calls[4].params[4], 0);
});
test('preflight exige CHECK original habilitado y columna 008 correcta', async () => {
  for (const stage of [6, 7, 8]) for (const broken of [false, true]) {
    const c = { async execute(sql) {
      if (sql.includes('information_schema.COLUMNS')) return [[
        { name: 'rol', type: "enum('ADMIN','SUBDIRECCION','REGISTRADOR'" + (stage >= 7 ? ",'SUPERUSUARIO')" : ')'), nullable: 'NO' },
        ...(stage === 8 ? [{ name: 'debe_cambiar_password', type: 'tinyint(1)', nullable: 'NO', initial: '0' }] : []),
      ]];
      return [[{ clause: "((`rol` <> _utf8mb4'SUBDIRECCION') or (`nivel_asignado` is not null))", enforced: broken ? 'NO' : 'YES' }]];
    } };
    if (broken) await assert.rejects(assertUserSchema(c, stage)); else await assertUserSchema(c, stage);
  }
});
