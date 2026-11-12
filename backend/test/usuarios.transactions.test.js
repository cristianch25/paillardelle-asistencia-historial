import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { testUser } from '../test-support/usuarios-update-pool.js';

// Solo conexiones simuladas. Nunca accede a MySQL ni registra errores completos.
function scenario(operation, options = {}) {
  const events = [];
  const primary = new Error('Error principal ficticio');
  const cleanup = new Error('Error de limpieza ficticio');
  const connection = {
    async beginTransaction() {
      events.push('begin');
      if (options.failAt === 'begin') throw primary;
    },
    async execute(sql, params) {
      if (sql.endsWith('FOR UPDATE') && options.failAt === 'lock') throw primary;
      if (sql.startsWith('SELECT id FROM usuarios WHERE rol')) return [[{ id: '1' }]];
      if (sql.startsWith('SELECT')) return [[testUser(params[0])]];
      if (sql.startsWith('INSERT INTO auditoria_administrativa')) {
        events.push('audit');
        if (options.failAt === 'audit') throw primary;
        return [{ affectedRows: 1 }];
      }
      events.push('write');
      if (options.failAt === 'write') throw primary;
      return [{ affectedRows: 1, insertId: '2' }];
    },
    async commit() {
      events.push('commit');
      if (options.failAt === 'commit') throw primary;
    },
    async rollback() {
      events.push('rollback');
      if (options.rollbackFails) throw cleanup;
    },
    release() {
      events.push('release');
      if (options.releaseFails) throw cleanup;
    },
    destroy() {
      events.push('destroy');
      if (options.destroyFails) throw cleanup;
    },
  };
  const repository = createUsuariosRepository(() => ({ async getConnection() {
    events.push('acquire');
    if (options.failAt === 'acquire') throw primary;
    return connection;
  } }));
  const run = () => operation === 'create'
    ? repository.create({ nombres: 'Nombre', apellidos: 'Ficticio', usuario: 'ficticio',
      rol: 'ADMIN', password_hash: 'HASH_FICTICIO' }, '1', () => {})
    : repository.update('2', '1', { nombres: 'Nuevo' }, () => ({ nombres: 'Nuevo' }));
  return { run, events, primary, cleanup };
}

for (const operation of ['create', 'update']) {
  test(`${operation}: COMMIT exitoso libera la conexión una sola vez`, async () => {
    const { run, events } = scenario(operation);
    await run();
    assert.deepEqual(events.slice(-2), ['commit', 'release']);
    assert.equal(events.filter(event => event === 'acquire').length, 1);
    assert.equal(events.includes('rollback'), false);
    assert.equal(events.includes('destroy'), false);
  });

  test(`${operation}: COMMIT fallido siempre descarta, preserva error y no reintenta`, async () => {
    for (const options of [{}, { rollbackFails: true }, { destroyFails: true },
      { rollbackFails: true, destroyFails: true }]) {
      const { run, events, primary } = scenario(operation, { failAt: 'commit', ...options });
      await assert.rejects(run, error => error === primary);
      assert.deepEqual(events.slice(-3), ['commit', 'rollback', 'destroy']);
      assert.equal(events.includes('release'), false);
      assert.equal(events.filter(event => event === 'commit').length, 1);
      assert.equal(events.filter(event => event === 'acquire').length, 1);
    }
  });

  test(`${operation}: adquisición, BEGIN, bloqueo, escritura, auditoría y COMMIT preservan el error principal`, async () => {
    for (const failAt of ['acquire', 'begin', 'lock', 'write', 'audit', 'commit']) {
      const { run, events, primary } = scenario(operation, { failAt });
      await assert.rejects(run, error => error === primary);
      if (failAt === 'acquire') assert.deepEqual(events, ['acquire']);
      else if (failAt === 'commit') assert.deepEqual(events.slice(-2), ['rollback', 'destroy']);
      else assert.deepEqual(events.slice(-2), ['rollback', 'release']);
      if (['begin', 'lock', 'write', 'audit'].includes(failAt)) assert.equal(events.includes('commit'), false);
    }
  });

  test(`${operation}: ROLLBACK fallido descarta la conexión, incluso si destroy también falla`, async () => {
    for (const destroyFails of [false, true]) {
      const { run, events, primary } = scenario(operation, {
        failAt: 'audit', rollbackFails: true, destroyFails,
      });
      await assert.rejects(run, error => error === primary);
      assert.deepEqual(events.slice(-2), ['rollback', 'destroy']);
      assert.equal(events.includes('release'), false);
      assert.equal(events.includes('commit'), false);
    }
  });

  test(`${operation}: release/destroy fallidos no ocultan un error previo de escritura`, async () => {
    const { run, events, primary } = scenario(operation, {
      failAt: 'write', releaseFails: true, destroyFails: true,
    });
    await assert.rejects(run, error => error === primary);
    assert.deepEqual(events.slice(-3), ['rollback', 'release', 'destroy']);
  });

  test(`${operation}: un fallo de release tras COMMIT se informa y descarta la conexión`, async () => {
    const { run, events, cleanup } = scenario(operation, { releaseFails: true, destroyFails: true });
    await assert.rejects(run, error => error === cleanup);
    assert.deepEqual(events.slice(-3), ['commit', 'release', 'destroy']);
    assert.equal(events.includes('rollback'), false);
  });
}
