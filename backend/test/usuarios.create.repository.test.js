import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';

// Dobles de conexión: ningún INSERT de estas pruebas llega a MySQL.
const data = { nombres: 'Nombre', apellidos: 'Ficticio', usuario: 'cuenta_ficticia',
  rol: 'ADMIN', password_hash: 'HASH_FICTICIO' };

function fixture(failAt) {
  const events = [];
  const row = { ...data, id: '9007199254740993', cargo: null, nivel_asignado: null,
    activo: 1, puede_escanear_qr: 0, puede_usar_bitacora: 0,
    created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' };
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
    async execute(sql, params) {
      events.push({ sql, params });
      if (sql.endsWith('FOR UPDATE')) return [[{ id: '7', rol: 'ADMIN', activo: 1 }]];
      if (sql.startsWith('INSERT INTO usuarios')) {
        if (failAt === 'duplicate') throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
        return [{ affectedRows: 1, insertId: row.id }];
      }
      if (sql.startsWith('SELECT')) return [failAt === 'read' ? [] : [row]];
      if (failAt === 'audit') throw new Error('Fallo ficticio de auditoría');
      return [{ affectedRows: 1 }];
    },
  };
  const repository = createUsuariosRepository(() => ({
    getConnection: async () => connection,
  }));
  return { repository, events };
}

test('repositorio de alta: usuario y auditoría se confirman juntos, sin secretos en auditoría', async () => {
  const { repository, events } = fixture();
  const user = await repository.create(data, '7', actor => {
    assert.equal(actor.id, '7');
    assert.equal(actor.rol, 'ADMIN');
    assert.equal(actor.activo, 1);
    events.push('authorized');
  });
  assert.equal(user.id, '9007199254740993');
  assert.equal(Object.hasOwn(user, 'password_hash'), false);
  assert.equal(events[0], 'begin');
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
  const [lock, ...statements] = events.filter(event => typeof event === 'object');
  assert.match(lock.sql, /FROM usuarios WHERE id = \? LIMIT 1 FOR UPDATE$/);
  assert.deepEqual(lock.params, ['7']);
  assert.equal(events[2], 'authorized');
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /^INSERT INTO usuarios \(nombres, apellidos, usuario, password_hash, rol\) VALUES \(\?, \?, \?, \?, \?\)$/);
  assert.deepEqual(statements[0].params, [data.nombres, data.apellidos, data.usuario, data.password_hash, data.rol]);
  assert.match(statements[1].sql, /WHERE id = \? LIMIT 1$/);
  assert.deepEqual(statements[1].params, [user.id]);
  assert.match(statements[2].sql, /^INSERT INTO auditoria_administrativa/);
  assert.deepEqual(statements[2].params.slice(0, 5), ['7', 'CREAR_USUARIO', 'usuarios', user.id, null]);
  assert.deepEqual(JSON.parse(statements[2].params[5]), user);
  assert.equal(statements[2].params[5].includes(data.password_hash), false);
  for (const { sql } of statements) {
    assert.equal(sql.includes(data.usuario), false);
    assert.equal(sql.includes(data.password_hash), false);
    assert.equal(/UPDATE|DELETE|ALTER|DROP/.test(sql), false);
  }
});

test('repositorio de alta: falla UNIQUE, lectura o auditoría y revierte sin confirmar', async () => {
  for (const failAt of ['duplicate', 'read', 'audit']) {
    const { repository, events } = fixture(failAt);
    await assert.rejects(repository.create(data, '7', () => {}));
    assert.equal(events.includes('commit'), false);
    assert.deepEqual(events.slice(-2), ['rollback', 'release']);
    if (failAt === 'duplicate') {
      assert.equal(events.filter(event => event.sql?.startsWith('INSERT')).length, 1);
    }
  }
});

test('repositorio de alta: consulta previa parametrizada sin seleccionar hash', async () => {
  let query;
  const repository = createUsuariosRepository(() => ({
    async execute(sql, params) { query = { sql, params }; return [[]]; },
  }));
  const username = "cuenta' OR 1=1 --";
  assert.equal(await repository.findByUsername(username), null);
  assert.equal(query.sql, 'SELECT id FROM usuarios WHERE usuario = ? LIMIT 1');
  assert.deepEqual(query.params, [username]);
});

test('altas concurrentes: el duplicado del INSERT produce 409 aunque ambas consultas previas estén vacías', async () => {
  let inserted = false;
  const service = createUsuariosService({ repository: {
    findByUsername: async () => null,
    async create(user) {
      if (inserted) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
      inserted = true;
      return { ...user, id: '10', activo: 1 };
    },
  } });
  const body = { nombres: 'Nombre', apellidos: 'Ficticio', usuario: 'ficticio',
    rol: 'ADMIN', password: 'ClaveFicticia' };
  const results = await Promise.allSettled([service.create(body, '1'), service.create(body, '1')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
});
