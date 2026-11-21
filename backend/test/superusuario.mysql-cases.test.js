import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localCreation } from '../integration/superusuario-inicial.cases.js';
import { initializationPool } from '../test-support/superusuario-local-pool.js';
import { initialCases } from '../integration/superusuario-inicial.cases.js';
import { digest } from '../test-support/superusuario-mysql-schema.js';
import bcrypt from 'bcrypt';
import { superuserFixture } from '../test-support/superusuario-fixture.js';
import { testUser } from '../test-support/usuarios-update-pool.js';
import { fixture } from '../test-support/superusuario-mysql-fixture.js';
import { fixturePassword, originalNames } from '../test-support/superusuario-mysql-schema.js';
import { authCases } from '../integration/superusuario-auth.cases.js';
import { permissionCases } from '../integration/superusuario-permisos.cases.js';
import { transactionCases } from '../integration/superusuario-transacciones.cases.js';
import { concurrencyCases } from '../integration/superusuario-concurrencia.cases.js';

const manifest = { uuid: '12345678-1234-4321-abcd-123456789abc', schema: 'asistencia_paillardelle' };
test('caso preparado de CLI local: ejecuta el flujo completo con pool falso y confirmación exacta', async () => {
  const { pool, state } = initializationPool(); state.server.port = 3312;
  const id = await localCreation({ pool }, manifest);
  assert.equal(id, '9007199254740993');
  assert.equal(state.users.at(-1).usuario, 'su_tecnico'); assert.equal(state.audits.length, 1);
  await assert.rejects(localCreation({ pool }, manifest), { code: 'LOCAL_SUPERUSER_EXISTS' });
});
test('casos de alta local preparados: rollback y concurrencia corren sobre mocks, sin MySQL', async () => {
  const { pool: raw, state } = initializationPool(); state.server.port = 3312;
  const original = digest(state.users);
  const pool = { async getConnection() {
    const c = await raw.getConnection(); c.query = async () => [[]];
    const execute = c.execute.bind(c);
    c.execute = async (sql, params) => {
      if (sql.startsWith('INSERT INTO inexistente')) throw Object.assign(new Error(), { code: 'ER_NO_SUCH_TABLE' });
      return execute(sql, params);
    };
    return c;
  }, async execute(sql) {
    if (sql.includes("WHERE rol='SUPERUSUARIO'")) return [state.users.filter(row => row.rol === 'SUPERUSUARIO')];
    if (sql.includes("WHERE accion='CREAR_SUPERUSUARIO_LOCAL'")) return [state.audits.map(row => ({
      usuario_id: row[0], datos_nuevos: row[5] }))];
    throw new Error('Lectura inesperada');
  } };
  const f = { pool, snapshot: async () => digest([state.users, state.audits]),
    account: async id => state.users.find(row => row.id === id),
    originalAccountsUnchanged: async () => assert.equal(digest(state.users.filter(row => row.rol !== 'SUPERUSUARIO')), original) };
  let count = 0;
  const id = await initialCases(async (_name, work) => { await work(); count++; }, f, manifest);
  assert.equal(count, 4); assert.equal(id, '9007199254740995');
});
test('casos preparados: HTTP, permisos, rollback y concurrencia con repositorios falsos', async () => {
  const { state } = await superuserFixture();
  state.users.delete('9');
  state.users.set('5', testUser('5', 'ADMIN', { activo: 0 }));
  const oldHash = await bcrypt.hash(fixturePassword, 4);
  for (const [index, user] of [...state.users.values()].entries()) {
    Object.assign(user, { usuario: originalNames[index], password_hash: oldHash, debe_cambiar_password: 0 });
  }
  const execute = state.pool.execute.bind(state.pool);
  const acquire = state.pool.getConnection.bind(state.pool); let sequence = 100, connectionId = 0;
  const uncommitted = new Set();
  state.pool.getConnection = async () => {
    const c = await acquire(), originalExecute = c.execute.bind(c);
    c.threadId = ++connectionId;
    c.query = async sql => { assert.match(sql, /^SET (TRANSACTION|SESSION)/); return [[]]; };
    let inserted;
    for (const method of ['commit', 'rollback']) {
      const originalMethod = c[method].bind(c);
      c[method] = async () => { try { return await originalMethod(); } finally { uncommitted.delete(inserted); } };
    }
    c.execute = async (sql, params) => {
      if (!sql.startsWith('INSERT INTO usuarios ')) return originalExecute(sql, params);
      const fields = sql.match(/\(([^)]+)\)/)[1].split(',').map(field => field.trim());
      const data = Object.fromEntries(fields.map((field, index) => [field,
        typeof params[index] === 'boolean' ? Number(params[index]) : params[index]]));
      if ([...state.users.values()].some(row => row.usuario === data.usuario)) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
      const id = String(sequence++);
      state.users.set(id, testUser(id, data.rol, { debe_cambiar_password: 0, ...data }));
      inserted = id; uncommitted.add(id);
      return [{ insertId: id, affectedRows: 1 }];
    };
    return c;
  };
  state.pool.execute = async (sql, params) => {
    if (sql.includes("WHERE rol='ADMIN' AND activo=1")) {
      const active = [...state.users.values()].filter(row => row.rol === 'ADMIN' && row.activo);
      return sql.includes('COUNT(*)') ? [[{ n: active.length }]] : [active];
    }
    if (/FROM usuarios WHERE usuario\s*=/.test(sql)) {
      const name = params?.[0] ?? sql.match(/usuario='([^']+)'/)[1];
      return [[...state.users.values()].filter(row => row.usuario === name && !uncommitted.has(row.id))];
    }
    if (sql.startsWith('SELECT * FROM usuarios')) {
      let rows = [...state.users.values()];
      if (sql.includes('WHERE id=')) rows = rows.filter(row => row.id === params[0]);
      if (sql.includes('WHERE usuario IN')) rows = rows.filter(row => params.includes(row.usuario));
      return [structuredClone(rows)];
    }
    if (sql.startsWith('SELECT * FROM auditoria_administrativa')) return [state.audits.map(row => ({
      usuario_id: row[0], accion: row[1], datos_anteriores: row[4], datos_nuevos: row[5] }))];
    return execute(sql, params);
  };
  const f = await fixture(state.pool); let count = 0;
  try {
    state.users.set('9', testUser('9', 'SUPERUSUARIO', {
      usuario: 'su_tecnico', password_hash: await bcrypt.hash('Local-Sintetico3312-Inicial', 4), debe_cambiar_password: 0 }));
    const runCase = async (_name, work) => { await work(); count++; };
    const session = await authCases(runCase, f, '9');
    await permissionCases(runCase, f, session);
    await transactionCases(runCase, f, session);
    await concurrencyCases(runCase, f, session);
    assert.equal(count, 18);
  } finally { await f.close(); }
});
