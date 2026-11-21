import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { assertPartialMarkers, resumeBase } from '../scripts/lib/superusuario-mysql-prepare.js';
import { main } from '../scripts/superusuario-mysql.mjs';
import { assertEmpty006, assertSeeded006, base006Reference } from '../test-support/superusuario-mysql-base006.js';
import { digest, sqlFiles, originalNames } from '../test-support/superusuario-mysql-schema.js';

const manifest = { run: 'aabbcc112233', uuid: '12345678-1234-1234-1234-123456789abc' };
const lock = { isFile: () => true, isSymbolicLink: () => false, size: 0 };
const missing = () => { throw Object.assign(new Error('Ausente'), { code: 'ENOENT' }); };

test('continuación exige lock original vacío y todos los registros posteriores ausentes', async () => {
  await assertPartialMarkers(manifest, async file => path.basename(file) === 'prepare.lock' ? lock : missing());
  for (const file of ['base.json', 'ready.json', 'upgrade.lock', 'suite.lock', 'resume.lock']) {
    await assert.rejects(assertPartialMarkers(manifest, async name =>
      ['prepare.lock', file].includes(path.basename(name)) ? lock : missing()));
  }
  for (const invalid of [null, { ...lock, size: 1 }, { ...lock, isFile: () => false },
    { ...lock, isSymbolicLink: () => true }]) {
    await assert.rejects(assertPartialMarkers(manifest, async () => invalid ?? missing()));
  }
});

for (const failure of [null, 'inspect', 'connect', 'validate', 'revalidate', 'mark', 'finish']) {
  test(`resume-base: orden protegido y sin reintento ante ${failure ?? 'éxito'}`, async () => {
    const savedAdmin = process.env.MATRICULAS_MYSQL_ADMIN_PASSWORD;
    const savedRunner = process.env.SUPERUSUARIO_MYSQL_PASSWORD;
    Object.assign(process.env, { MATRICULAS_MYSQL_ADMIN_PASSWORD: 'a'.repeat(64), SUPERUSUARIO_MYSQL_PASSWORD: 'b'.repeat(64) });
    const calls = [], options = { filesProvider: async () => [] };
    for (const step of ['inspect', 'connect', 'validate', 'revalidate', 'mark', 'finish']) options[step] = async (...args) => {
      calls.push(step);
      if (step === 'mark') assert.equal(args[1], 'resume.lock');
      if (failure === step) throw new Error('Fallo controlado');
      if (step === 'connect') return { end: async () => { calls.push('end'); } };
    };
    try {
      const operation = () => resumeBase(manifest, manifest.uuid, options);
      if (failure) await assert.rejects(operation(), /Fallo controlado/); else await operation();
      const order = ['inspect', 'connect', 'validate', 'revalidate', 'mark', 'finish'];
      assert.deepEqual(calls, [...order.slice(0, failure ? order.indexOf(failure) + 1 : order.length),
        ...(!['inspect', 'connect'].includes(failure) ? ['end'] : [])]);
      calls.length = 0;
      await assert.rejects(resumeBase(manifest, 'otro UUID', options));
      assert.deepEqual(calls, []);
    } finally {
      for (const [key, value] of [['MATRICULAS_MYSQL_ADMIN_PASSWORD', savedAdmin], ['SUPERUSUARIO_MYSQL_PASSWORD', savedRunner]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
}

test('CLI exige UUID explícito antes de consultar manifiesto o proceso', async () => {
  for (const extra of [[], ['--expected-uuid=otro'], [`--expected-uuid=${manifest.uuid}`, 'adicional']]) {
    let loaded = false;
    await assert.rejects(main(['resume-base', manifest.run, '--allow-temporary-mysql-3312', ...extra],
      { manifestLoader: async () => { loaded = true; } }));
    assert.equal(loaded, false);
  }
});

function schemaMock({ changed = false, nonempty = false, badConfig = false, runner = false, extras = false,
  seeded = false, badFixture = false } = {}) {
  const tables = ['usuarios', 'configuracion_sistema', ...Array.from({ length: 18 }, (_, i) => `tabla_${String.fromCharCode(97 + i)}`)].sort();
  const definition = name => `CREATE TABLE ${name} (id bigint NOT NULL) ENGINE=InnoDB`;
  const reference = { sources: digest(['v1', '002', '003', '004', '005', '006']),
    structure: digest(tables.map(name => [name, definition(name)])) };
  const c = { async execute(sql) {
    if (sql.includes('information_schema.COLUMNS')) return [[{ name: 'rol', type: "enum('ADMIN','SUBDIRECCION','REGISTRADOR')", nullable: 'NO' }]];
    if (sql.includes('CHECK_CONSTRAINTS')) return [[{ clause: "rol <> \\'SUBDIRECCION\\' OR nivel_asignado IS NOT NULL", enforced: 'YES' }]];
    throw new Error('SQL inesperado');
  }, async query(sql) {
    assert.match(sql, /^(SHOW|SELECT)\s/, 'La verificación nunca ejecuta DDL/DML');
    if (sql === 'SHOW TABLES') return [tables.map(table => ({ table }))];
    if (sql.startsWith('SHOW CREATE TABLE ')) return [[{ 'Create Table': definition(sql.slice(18)) + (changed ? ' CAMBIO' : ' AUTO_INCREMENT=6') }]];
    if (sql === 'SHOW DATABASES') return [['asistencia_paillardelle', 'information_schema', 'mysql', 'performance_schema', 'sys'].map(Database => ({ Database }))];
    if (sql.startsWith('SELECT COUNT(*)')) return [[{ n: sql.endsWith('configuracion_sistema') ? 2 : sql.endsWith('usuarios') && seeded ? 5 : nonempty ? 1 : 0 }]];
    if (sql.startsWith('SELECT clave')) return [[{ clave: 'bitacora_habilitada', valor: badConfig ? 'true' : 'false', updated_by: null },
      { clave: 'qr_habilitado', valor: 'false', updated_by: null }]];
    if (sql.startsWith('SELECT User')) return [[{ User: runner ? 'superusuario_runner' : 'root', Host: 'localhost' }]];
    if (sql.startsWith('SELECT usuario')) return [originalNames.map((usuario, i) => ({ usuario,
      rol: badFixture ? 'SUPERUSUARIO' : i === 2 ? 'SUBDIRECCION' : i === 3 ? 'REGISTRADOR' : 'ADMIN',
      nivel_asignado: i === 2 ? 'PRIMARIA' : null, activo: i === 4 ? 0 : 1,
    })).sort((a, b) => a.usuario.localeCompare(b.usuario))];
    if (sql.includes('information_schema.TRIGGERS')) return [[{ n: extras ? 1 : 0 }]];
    throw new Error('SQL inesperado');
  } };
  return { c, reference, files: ['v1', '002', '003', '004', '005', '006'] };
}

test('referencia 006 corresponde exactamente a las seis fuentes versionadas', async () => {
  assert.equal(digest((await sqlFiles()).slice(0, 6)), base006Reference.sources);
});
test('006 completa acepta solo contador AUTO_INCREMENT diferente; no repite DDL', async () => {
  const { c, files, reference } = schemaMock();
  await assertEmpty006(c, files, reference);
  await assert.rejects(assertEmpty006(c, [...files, 'otra'].slice(1), reference));
});
for (const changed of ['changed', 'nonempty', 'badConfig', 'runner', 'extras']) {
  test(`006 parcial rechaza ${changed} antes de crear fixtures`, async () => {
    const { c, files, reference } = schemaMock({ [changed]: true });
    await assert.rejects(assertEmpty006(c, files, reference));
  });
}
test('cola comprueba cinco fixtures exactos, configuración y estructura antes de base.json', async () => {
  const valid = schemaMock({ seeded: true });
  await assertSeeded006(valid.c, valid.files, valid.reference);
  for (const changed of ['changed', 'badConfig', 'badFixture']) {
    const { c, files, reference } = schemaMock({ seeded: true, [changed]: true });
    await assert.rejects(assertSeeded006(c, files, reference));
  }
});
