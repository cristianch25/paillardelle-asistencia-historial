import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { preparationError } from '../src/modules/importaciones/preparation-error.js';
import { confirmationContext } from '../src/modules/importaciones/confirmation-context.js';
import { createImportPreviewRoutes } from '../src/modules/importaciones/routes.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { confirmationFixture } from '../test-support/importaciones/confirmation-fixture.js';
import { actor, record, selection, year } from '../test-support/importaciones/reconciliation-fixture.js';

test('diagnóstico clasifica el error MySQL 3569 demostrado sin publicar el mensaje', () => {
  const logs = [];
  preparationError(Object.assign(new Error('Table j appears in multiple locking clauses.'),
    { code: 'ER_DUPLICATE_TABLE_LOCK', errno: 3569 }), 'CONTACTOS', value => logs.push(value));
  assert.equal(logs[0].codigo, 'ER_DUPLICATE_TABLE_LOCK');
  assert.equal(logs[0].numero, 3569);
  assert.doesNotMatch(JSON.stringify(logs), /Table j/);
});

test('diagnóstico preserva causa y emite solo etapa/código/ubicación relativa, nunca SQL ni datos privados', () => {
  const original = Object.assign(new Error('SQL secreto\nSELECT DNI_PRIVADO, TELEFONO_PRIVADO, TOKEN_PRIVADO'),
    { code: 'ER_BAD_FIELD_ERROR', errno: 1054, sql: 'SQL_PRIVADO', sqlMessage: 'HASH_PRIVADO' });
  original.stack = `${original.name}: ${original.message}\n    at execute (C:/privado/backend/src/modules/importaciones/reconciliation.repository.js:20:10)`;
  const logs = [], result = preparationError(original, 'CONTACTOS', value => logs.push(value));
  assert.equal(result.cause, original); assert.equal(result.status, 500);
  assert.deepEqual(logs, [{ evento: 'SIAGIE_PREPARACION_FALLIDA', etapa: 'CONTACTOS', tipo: 'Error',
    codigo: 'ER_BAD_FIELD_ERROR', numero: 1054, ubicacion: 'backend/src/modules/importaciones/reconciliation.repository.js:20:10' }]);
  assert.doesNotMatch(JSON.stringify([result, logs]), /SQL secreto|SELECT|PRIVADO|C:\/privado/);
  const fallback = [];
  preparationError(Object.assign(new TypeError('TOKEN_PRIVADO'), { code: 'TOKEN_PRIVADO', errno: 'TOKEN_PRIVADO' }),
    'TOKEN_PRIVADO', value => fallback.push(value));
  assert.equal(fallback[0].etapa, 'DESCONOCIDA'); assert.equal(fallback[0].codigo, 'NO_CLASIFICADO');
  assert.equal(fallback[0].tipo, 'TypeError'); assert.equal(fallback[0].numero, null);
  assert.equal(preparationError(original, 'CONTACTOS', () => { throw new Error('logger fallido'); }).cause, original);
});

test('composición transaccional real localiza fallo SQL de identidades antes del guardado de 23 filas', async t => {
  const logs = [], calls = [];
  t.mock.method(console, 'error', value => logs.push(value));
  const original = Object.assign(new Error('Consulta y documento privados'), { code: 'ER_PARSE_ERROR', errno: 1064 });
  const connection = { async execute(sql) {
    calls.push(sql);
    if (sql.includes('FROM usuarios')) return [[actor]];
    if (sql.includes('FROM anios_escolares')) return [[year]];
    if (sql.includes('WITH incoming')) throw original;
    throw new Error('La prueba no debe llegar a otras operaciones.');
  } };
  await assert.rejects(confirmationContext(connection).reconcile.prepare({ registros: Array.from({ length: 23 }, (_, i) => record({}, i)) },
    selection, actor), error => error.status === 500 && error.cause === original);
  assert.equal(logs.length, 1); assert.equal(logs[0].etapa, 'IDENTIDADES'); assert.equal(logs[0].codigo, 'ER_PARSE_ERROR');
  assert.ok(calls.some(sql => /FOR UPDATE$/.test(sql)));
  assert.ok(calls.every(sql => !/^(INSERT|UPDATE|DELETE|COMMIT)/.test(sql)));
});

test('POST 500 en preparación de 23 filas: rollback, ningún efecto/recibo y GET no anuncia éxito', async () => {
  const logs = [];
  const f = await confirmationFixture({ records: Array.from({ length: 23 }, (_, i) => record({}, i)),
    onPreparationError: value => logs.push(value) });
  const app = express();
  app.use('/api/importaciones', createImportPreviewRoutes({ authenticate: async () => actor }, f.preview));
  app.use(errorHandler); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/importaciones`;
  const headers = { Authorization: 'Bearer ficticio', 'Content-Type': 'application/json' };
  f.reconciliation.yearError = Object.assign(new Error('SQL y contraseña privados'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 });
  try {
    const response = await fetch(`${base}/vistas-previas/${f.view.id}/confirmacion`, { method: 'POST', headers, body: JSON.stringify(f.input) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'No se pudo preparar la propuesta de importación.' });
    assert.equal(logs.length, 1); assert.equal(logs[0].etapa, 'ANIO'); assert.equal(logs[0].codigo, 'ER_NO_SUCH_TABLE');
    for (const table of ['students', 'enrollments', 'contacts', 'links', 'audits', 'receipts']) assert.equal(f.state[table].length, 0);
    assert.ok(f.state.events.includes('rollback')); assert.ok(!f.state.events.includes('academic'));
    assert.ok(!f.state.events.includes('commit'));
    const status = await fetch(`${base}/confirmaciones/${f.input.clave_operacion}`, { headers });
    assert.equal(status.status, 200); assert.deepEqual(await status.json(), { estado: 'SIN_CONFIRMACION_VERIFICADA' });
  } finally { f.close(); await new Promise(resolve => server.close(resolve)); }
});
