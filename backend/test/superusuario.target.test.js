import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSuperuserSchema, inspectSuperuserTarget, targetConfirmation,
  validateExpectedUuid } from '../scripts/lib/superusuario-target.js';

const uuid = '12345678-1234-4321-abcd-123456789abc';
const config = { host: 'localhost', port: 3399, database: 'asistencia_paillardelle' };
const server = { db: config.database, hostname: 'instancia-ficticia', port: config.port,
  uuid, version: '8.4.13', sql_account: 'operador_ficticio@localhost' };
function fixture(overrides = {}) {
  const calls = [];
  const connection = { async execute(sql) {
    calls.push(sql);
    if (sql.includes('information_schema.TABLES')) return [[
      { name: 'auditoria_administrativa', engine: 'InnoDB' }, { name: 'usuarios', engine: 'InnoDB' },
    ].map(row => ({ ...row, ...overrides.table }))];
    if (sql.includes('information_schema.COLUMNS')) return [[{ type:
      "enum('ADMIN','SUBDIRECCION','REGISTRADOR','SUPERUSUARIO')", nullable: 'NO', ...overrides.role }]];
    if (sql.includes('information_schema.STATISTICS')) return [overrides.indexes ?? [{ name: 'usuario', non_unique: 0 }]];
    return [[{ ...server, ...overrides.server }]];
  } };
  return { connection, calls };
}

test('destino: identifica UUID, endpoint, hostname, puerto real, cuenta SQL y base sin escrituras', async () => {
  const { connection, calls } = fixture();
  const target = await inspectSuperuserTarget(connection, config, uuid.toUpperCase());
  assert.deepEqual(target, { host: config.host, endpoint_port: config.port, ...server });
  assert.equal(targetConfirmation(target), `CREAR SUPERUSUARIO localhost:3399/asistencia_paillardelle ${uuid}`);
  await assertSuperuserSchema(connection);
  assert.equal(calls.every(sql => sql.startsWith('SELECT')), true);
});

test('destino: nombre de base correcto no basta; UUID, puerto, versión e identidad deben ser verificables', async () => {
  for (const server of [{ uuid: 'aaaaaaaa-1234-4321-abcd-123456789abc' }, { port: 3400 },
    { db: 'otra' }, { hostname: '' }, { sql_account: '' }, { version: '9.0.0' }, { uuid: null }]) {
    const { connection } = fixture({ server });
    await assert.rejects(inspectSuperuserTarget(connection, config, uuid), { code: 'LOCAL_TARGET_MISMATCH' });
  }
  assert.equal(validateExpectedUuid(uuid), uuid);
  for (const value of ['', undefined, 'copiar-de-pantalla', '00000000-0000-0000-0000-000000000000']) {
    assert.throws(() => validateExpectedUuid(value), { code: 'LOCAL_TARGET_INVALID' });
  }
});

test('esquema: falla cerrado sin 007, sin InnoDB o sin índice único original; nunca adapta el esquema', async () => {
  for (const overrides of [{ role: { type: "enum('ADMIN','SUBDIRECCION','REGISTRADOR')" } },
    { role: { nullable: 'YES' } }, { table: { engine: 'MyISAM' } }, { indexes: [] },
    { indexes: [{ name: 'usuario', non_unique: 1 }] },
    { indexes: [{ name: 'usuario', non_unique: 0 }, { name: 'id', non_unique: 0 }] }]) {
    const { connection, calls } = fixture(overrides);
    await assert.rejects(assertSuperuserSchema(connection), { code: 'LOCAL_SCHEMA_UNSUPPORTED' });
    assert.equal(calls.some(sql => /ALTER|CREATE|INSERT|UPDATE|DELETE/.test(sql)), false);
  }
});
