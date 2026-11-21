import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import callbackMysql from 'mysql2';
import { openVerified, superuserActivation, profileOf } from './matriculas-mysql-safety.js';

export function suiteEnabled(env) {
  return env.SUPERUSUARIO_MYSQL_ENABLE === superuserActivation && /^[a-f0-9]{12}$/.test(env.SUPERUSUARIO_MYSQL_RUN ?? '');
}
export function installConnectionFence(manifest, credentials) {
  assert.equal(profileOf(manifest), 'superusuario');
  assert.ok(suiteEnabled(process.env));
  for (const [key, value] of Object.entries({ DB_HOST: '127.0.0.1', DB_PORT: '3312',
    DB_NAME: manifest.schema, DB_USER: credentials.user, DB_PASSWORD: credentials.password })) {
    assert.ok(process.env[key] === value, `Entorno incorrecto: ${key}`);
  }
  const connect = mysql.createConnection.bind(mysql);
  const originals = [];
  for (const driver of [mysql, callbackMysql]) for (const key of ['createConnection', 'createPool', 'createPoolCluster']) {
    originals.push([driver, key, driver[key]]);
    driver[key] = () => { throw new Error('Conexión fuera del pool verificado de SUPERUSUARIO.'); };
  }
  const pool = { getConnection: () => openVerified(manifest, credentials, manifest.schema, connect),
    async execute(sql, params) {
      const c = await this.getConnection();
      try { return await c.execute(sql, params); } finally { await c.end(); }
    }, async query(sql, params) {
      const c = await this.getConnection();
      try { return await c.query(sql, params); } finally { await c.end(); }
    } };
  return { pool, restore() { for (const [driver, key, original] of originals) driver[key] = original; } };
}
