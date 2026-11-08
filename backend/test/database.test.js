import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDatabaseConfig } from '../src/config/database.js';
import { checkDatabase } from '../src/config/check-database.js';
import { describeDatabaseError } from '../src/config/database-errors.js';

// Valores ficticios solo para pruebas unitarias; nunca se abre una conexión.
const env = {
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_USER: 'usuario_prueba',
  DB_PASSWORD: 'secreto_ficticio',
  DB_NAME: 'asistencia_paillardelle',
};

test('no usa credenciales implícitas cuando falta configuración', () => {
  for (const key of Object.keys(env)) {
    assert.throws(() => readDatabaseConfig({ ...env, [key]: '' }), {
      message: `Configura ${key} en backend/.env o en el entorno.`,
    });
  }
});

test('rechaza puertos inválidos y bases distintas sin exponer valores', () => {
  for (const port of ['0', '65536', '-1', '3306.5', 'abc']) {
    assert.throws(() => readDatabaseConfig({ ...env, DB_PORT: port }), /DB_PORT/);
  }
  assert.throws(() => readDatabaseConfig({ ...env, DB_NAME: 'otra_base' }), /esquema SQL/);
});

test('la comprobación ejecuta solo SELECT y acepta la base esperada', async () => {
  const pool = {
    async query(sql) {
      assert.equal(sql, 'SELECT 1 AS ok, DATABASE() AS database_name');
      return [[{ ok: 1, database_name: 'asistencia_paillardelle' }]];
    },
  };
  await checkDatabase(pool);
});

test('la comprobación rechaza una base incorrecta, ausente o respuesta inválida', async () => {
  for (const row of [
    { ok: 1, database_name: 'otra_base' },
    { ok: 1, database_name: null },
    { ok: 0, database_name: 'asistencia_paillardelle' },
  ]) {
    await assert.rejects(checkDatabase({ query: async () => [[row]] }), /base de datos esperada/);
  }
});

test('acepta SELECT 1 como texto cuando MySQL lo devuelve como BIGINT', async () => {
  await checkDatabase({
    query: async () => [[{ ok: '1', database_name: 'asistencia_paillardelle' }]],
  });
});

test('rechaza otros textos y asigna un código seguro a errores de comprobación', async () => {
  for (const ok of ['0', '01', '1.0', true, null]) {
    await assert.rejects(checkDatabase({
      query: async () => [[{ ok, database_name: 'asistencia_paillardelle' }]],
    }), { code: 'DB_CHECK_FAILED' });
  }
});

test('el diagnóstico no expone mensajes, credenciales ni códigos desconocidos', () => {
  const secret = 'dato_ficticio_confidencial';
  const details = { message: secret, sqlMessage: secret, stack: secret };
  assert.equal(describeDatabaseError({ ...details, code: 'ER_ACCESS_DENIED_ERROR' }),
    'ER_ACCESS_DENIED_ERROR: MySQL rechazó la autenticación de la conexión.');
  for (const code of [secret, '__proto__', 'toString', undefined]) {
    assert.equal(describeDatabaseError({ ...details, code }),
      'UNKNOWN_DB_ERROR: Fallo no clasificado al verificar o cerrar la conexión MySQL.');
  }
});
