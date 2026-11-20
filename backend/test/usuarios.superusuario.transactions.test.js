import assert from 'node:assert/strict';
import { test } from 'node:test';
import { superuserFixture } from '../test-support/superusuario-fixture.js';

test('SUPERUSUARIO: desactivaciones concurrentes serializadas conservan el último ADMIN', async () => {
  const { state, usuariosService } = await superuserFixture();
  const results = await Promise.allSettled(['1', '2'].map(id =>
    usuariosService.update(id, { activo: false }, '9', true)));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.status, 409);
  assert.equal([...state.users.values()].filter(user => user.rol === 'ADMIN' && user.activo).length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0][0], '9');
  assert.equal(state.audits[0][1], 'CAMBIAR_ESTADO_USUARIO');
  const sql = state.transactions[0].filter(item => item.sql);
  assert.deepEqual(sql.slice(0, 3).map(item => item.params), [['ADMIN', 1], ['9'], ['1']]);
});

test('estado y password ADMIN: auditoría fallida revierte; COMMIT incierto descarta sin reintentar', async () => {
  for (const operation of ['state', 'password']) for (const failAt of ['audit', 'commit', 'commit-after']) {
    const { state, usuariosService } = await superuserFixture();
    state.failAt = failAt;
    const before = { ...state.users.get('1') };
    const run = operation === 'state'
      ? usuariosService.update('1', { activo: false }, '9', true)
      : usuariosService.resetPassword('1', {}, '9');
    await assert.rejects(run);
    const persisted = failAt === 'commit-after';
    assert.equal(state.audits.length, persisted ? 1 : 0);
    assert.equal(state.transactions.length, 1);
    assert.equal(state.transactions[0].at(-1), failAt === 'audit' ? 'release' : 'destroy');
    if (!persisted) assert.deepEqual(state.users.get('1'), before);
  }
});

test('revalida actor y destinatario bajo bloqueo, aunque cambien tras autenticación', async () => {
  for (const operation of ['state', 'password']) for (const scenario of ['inactive', 'actor-role', 'target-role']) {
    const { state, usuariosService } = await superuserFixture();
    const acquire = state.pool.getConnection.bind(state.pool);
    state.pool.getConnection = async () => {
      const connection = await acquire(), execute = connection.execute.bind(connection);
      connection.execute = async (sql, params) => {
        const result = await execute(sql, params);
        if (sql.startsWith('SELECT id FROM usuarios WHERE rol')) {
          if (scenario === 'inactive') state.users.get('9').activo = 0;
          if (scenario === 'actor-role') state.users.get('9').rol = 'REGISTRADOR';
          if (scenario === 'target-role') state.users.get('1').rol = 'SUPERUSUARIO';
        }
        return result;
      };
      return connection;
    };
    const run = operation === 'state' ? usuariosService.update('1', { activo: false }, '9', true)
      : usuariosService.resetPassword('1', {}, '9');
    await assert.rejects(run, { status: scenario === 'inactive' ? 401 : 403 });
    assert.equal(state.audits.length, 0);
    assert.equal(state.transactions[0].some(item => item.sql?.startsWith('UPDATE')), false);
  }
});

test('restablecer ADMIN no revoca JWT; estado y rol actuales limitan su uso', async () => {
  const { state, authService, usuariosService } = await superuserFixture();
  const before = await authService.login({ usuario: 'cuenta1', password: 'ClaveFicticiaInicial' });
  const reset = await usuariosService.resetPassword('1', {}, '9');
  assert.equal((await authService.authenticate(before.access_token)).rol, 'ADMIN');
  await assert.rejects(authService.login({ usuario: 'cuenta1', password: 'ClaveFicticiaInicial' }), { status: 401 });
  assert.equal((await authService.login({ usuario: 'cuenta1', password: reset.password_temporal })).user.rol, 'ADMIN');
  const audit = JSON.stringify(state.audits);
  for (const secret of [reset.password_temporal, state.users.get('1').password_hash, before.access_token]) {
    assert.equal(audit.includes(secret), false);
  }
  await usuariosService.update('1', { activo: false }, '9', true);
  await assert.rejects(authService.authenticate(before.access_token), { status: 401 });
});
