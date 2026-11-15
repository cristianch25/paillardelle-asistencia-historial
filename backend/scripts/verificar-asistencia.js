import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { hostname } from 'node:os';
import mysql from 'mysql2/promise';
import { readDatabaseConfig } from '../src/config/database.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { attendanceMysqlApp } from '../test-support/asistencia-mysql.js';
import { checkAttendanceHttp } from '../test-support/asistencia-http-checks.js';
import { checkAttendanceSchema } from '../test-support/asistencia-schema-checks.js';

// Ejecución manual posterior al ensayo 004. Jamás aplica DDL ni toca la base principal.
let pool, server, checks = 0;
try {
  if (process.argv.slice(2).join(' ') !== '--isolated') throw new Error('Requiere --isolated y el ensayo local de 004.');
  const metadata = JSON.parse((await readFile(new URL('../tmp/asistencia-004/metadata.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  const config = readDatabaseConfig();
  const schema = process.env.ASISTENCIA_TEST_SCHEMA ?? 'ensayo004_corregido';
  assert.match(schema, /^ensayo004_[a-z0-9_]+$/);
  pool = mysql.createPool({ ...config, host: '127.0.0.1', port: 3310, user: 'root', password: '', database: schema });
  const [[identity]] = await pool.query('SELECT @@server_uuid AS uuid, @@hostname AS hostname, @@port AS port, DATABASE() AS db');
  assert.equal(identity.uuid, metadata.verifiedUuid); assert.equal(Number(identity.port), 3310);
  assert.equal(identity.hostname.toLowerCase(), hostname().toLowerCase()); assert.equal(identity.db, schema);
  const [[initial]] = await pool.query('SELECT COUNT(*) AS total FROM sesiones_asistencia');
  assert.equal(Number(initial.total), 0, 'No repetir sobre una copia con sesiones previas.');
  const credentials = JSON.parse(await readFile(new URL('../tmp/demo-2026.credentials.json', import.meta.url), 'utf8'));
  const fixture = attendanceMysqlApp(pool);
  server = fixture.app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, token, status, body, method) {
    const response = await fetch(`${base}${path}`, { method: method ?? (body ? 'POST' : 'GET'),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (status !== null) assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
    assert.equal(response.headers.get('cache-control'), 'no-store'); checks++;
    return { status: response.status, data };
  }
  const tokens = { admin: createTokenService().issue('1').access_token };
  for (const key of ['sub-pri', 'sub-sec', 'reg-ini', 'reg-pri', 'reg-sec']) {
    const username = `demo26-${key}`;
    const result = await request('/auth/login', null, 200, { usuario: username, password: credentials[username] });
    tokens[key] = result.data.access_token;
    if (key === 'reg-ini') tokens.registrarId = result.data.user.id;
  }
  const ids = await checkAttendanceHttp(request, tokens, pool, fixture.faults, fixture.destroyed);
  const schemaChecks = await checkAttendanceSchema(pool, ids);
  console.log(JSON.stringify({ destino: `127.0.0.1:3310/${schema}`, comprobaciones_http: checks,
    restricciones_sql: schemaChecks, rollback_historial_auditoria: 'OK', commit_incierto: 'aplicado, conexión descartada, sin reintento',
    concurrencia_apertura: 'una sesión', resultado: 'OK' }));
} catch (error) {
  console.error(`Integración detenida: ${error.code ?? error.message}`); process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (pool) await pool.end();
}
