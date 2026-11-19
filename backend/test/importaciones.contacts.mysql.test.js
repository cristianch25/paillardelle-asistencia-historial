import assert from 'node:assert/strict';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { createReconciliationRepository } from '../src/modules/importaciones/reconciliation.repository.js';

// Opt-in: no crea esquema, no migra ni carga datos; solo el diagnóstico ficticio.
const database = process.env.SIAGIE_MYSQL_DATABASE;
test('MySQL aislado: JSON_TABLE con contactos bloquea c sin error 3569', { skip: !database }, async () => {
  assert.match(database, /^siagie_diag_ficticio_despues_20261118_v2$/);
  const config = { host: '127.0.0.1', port: 3311, database, user: 'root', password: '',
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, charset: 'utf8mb4' };
  const first = await mysql.createConnection(config);
  let second;
  try {
    const [[identity]] = await first.query('SELECT @@port port, DATABASE() db, @@server_uuid uuid');
    assert.equal(Number(identity.port), 3311); assert.equal(identity.db, database);
    assert.equal(identity.uuid, 'afb09129-e20f-11f1-8789-9c6b009e6a76');
    const [[contact]] = await first.execute("SELECT id FROM contactos WHERE tipo_documento = 'DNI' AND numero_documento = '00999999'");
    assert.ok(contact, 'Ejecutar primero el diagnóstico con datos ficticios.');
    await first.beginTransaction();
    const result = await createReconciliationRepository(() => first, true).contacts([
      { index: 0, tipo: 'DNI', numero: '00999999' }, { index: 1, tipo: 'DNI', numero: '00999999' },
    ], []);
    assert.equal(result.matches.length, 2);
    assert.ok(result.matches.every(row => row.id === String(contact.id)));
    assert.ok(result.links.length >= 1);
    assert.ok(result.links.every(row => row.contacto_id === String(contact.id)));
    // Probar que el cambio conserva un bloqueo real hasta terminar la transacción.
    second = await mysql.createConnection(config);
    await second.query('SET SESSION innodb_lock_wait_timeout = 1');
    await second.beginTransaction();
    await assert.rejects(second.execute('SELECT id FROM contactos WHERE id = ? FOR UPDATE', [contact.id]),
      { code: 'ER_LOCK_WAIT_TIMEOUT' });
    await first.rollback();
    const [unlocked] = await second.execute('SELECT id FROM contactos WHERE id = ? FOR UPDATE', [contact.id]);
    assert.equal(unlocked.length, 1);
  } finally {
    await first.rollback(); await first.end();
    if (second) { await second.rollback(); await second.end(); }
  }
});
