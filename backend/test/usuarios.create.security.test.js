import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { testUser } from '../test-support/usuarios-update-pool.js';

const body = { nombres: 'Nombre', apellidos: 'Ficticio', usuario: 'nuevo',
  password: 'ClaveFicticia', rol: 'REGISTRADOR' };

// Filas y bloqueos simulados compartidos por altas y PATCH reales del repositorio.
// Los cambios son locales a cada conexión hasta COMMIT; nunca se abre MySQL.
function fixture() {
  const state = { users: new Map(['1', '7'].map(id => [id, testUser(id)])), audits: [],
    events: [], failAt: undefined, pauseNextLock: false };
  const locks = new Map();
  state.locked = Promise.withResolvers();
  state.waiting = Promise.withResolvers();
  state.resume = Promise.withResolvers();
  const pool = {
    async execute() { return [[]]; },
    async getConnection() {
      const held = new Map(), pending = new Map(), audits = [], events = [];
      state.events.push(events);
      let committed = false;
      const finish = () => { for (const release of held.values()) release(); held.clear(); };
      const row = id => pending.get(id) ?? state.users.get(id);
      async function lock(id) {
        if (held.has(id)) return;
        if (state.failAt === 'lock') throw state.error;
        const previous = locks.get(id) ?? Promise.resolve();
        const gate = Promise.withResolvers();
        locks.set(id, gate.promise);
        events.push('lock-request:' + id);
        state.waiting.resolve();
        await previous;
        held.set(id, gate.resolve);
        events.push('lock-acquired:' + id);
        if (state.pauseNextLock) {
          state.pauseNextLock = false;
          state.locked.resolve();
          await state.resume.promise;
        }
      }
      return {
        async beginTransaction() { events.push('begin'); },
        async execute(sql, params) {
          events.push({ sql, params });
          if (sql.startsWith('SELECT id FROM usuarios WHERE rol')) {
            const admins = [...state.users.values()].filter(u => u.rol === 'ADMIN' && u.activo);
            for (const user of admins) await lock(user.id);
            return [admins.map(({ id }) => ({ id }))];
          }
          if (sql.includes('FROM asignaciones')) return [[]];
          if (sql.startsWith('SELECT')) {
            if (sql.endsWith('FOR UPDATE')) await lock(params[0]);
            const user = row(params[0]);
            return [user ? [{ ...user }] : []];
          }
          if (sql.startsWith('INSERT INTO usuarios')) {
            events.push('insert');
            if (state.failAt === 'insert') throw state.error;
            const fields = sql.match(/\(([^)]+)\)/)[1].split(', ');
            pending.set('9', testUser('9', body.rol, Object.fromEntries(fields.map((f, i) => [f, params[i]]))));
            return [{ affectedRows: 1, insertId: '9' }];
          }
          if (sql.startsWith('UPDATE usuarios')) {
            const id = params.at(-1), next = { ...row(id) };
            sql.split(' SET ')[1].split(' WHERE ')[0].split(', ').forEach((field, i) => {
              next[field.split(' = ')[0]] = params[i];
            });
            pending.set(id, next);
            return [{ affectedRows: 1 }];
          }
          assert.match(sql, /^INSERT INTO auditoria_administrativa/);
          if (state.failAt === 'audit') throw state.error;
          audits.push(params);
          return [{ affectedRows: 1 }];
        },
        async commit() {
          events.push('commit');
          if (state.failAt === 'commit') throw state.error;
          for (const [id, user] of pending) state.users.set(id, user);
          state.audits.push(...audits);
          committed = true;
          finish();
          if (state.failAt === 'commit-after') throw state.error;
        },
        async rollback() {
          events.push('rollback');
          if (!committed) { pending.clear(); audits.length = 0; }
          finish();
          if (state.rollbackFails) throw new Error('Rollback ficticio');
        },
        release() { events.push('release'); finish(); },
        destroy() { events.push('destroy'); finish(); },
      };
    },
  };
  const service = createUsuariosService({ repository: createUsuariosRepository(() => pool) });
  return { state, service };
}

test('V8: SUPERUSUARIO crea ADMIN con actor bloqueado y auditoría atómica sin secretos', async () => {
  for (const failAt of [undefined, 'audit', 'commit', 'commit-after']) {
    const { state, service } = fixture();
    state.users.set('1', testUser('1', 'SUPERUSUARIO'));
    state.failAt = failAt;
    state.error = new Error('Fallo ficticio');
    const run = service.create({ ...body, rol: 'ADMIN' }, '1');
    if (failAt) await assert.rejects(run, error => error === state.error);
    else assert.equal((await run).rol, 'ADMIN');
    const persisted = !failAt || failAt === 'commit-after';
    assert.equal(state.users.has('9'), persisted);
    assert.equal(state.audits.length, persisted ? 1 : 0);
    assert.equal(state.events.length, 1);
    if (persisted) {
      assert.deepEqual(state.audits[0].slice(0, 4), ['1', 'CREAR_USUARIO', 'usuarios', '9']);
      assert.equal(/password|HASH|ClaveFicticia/.test(state.audits[0][5]), false);
    }
    if (failAt?.startsWith('commit')) assert.equal(state.events[0].at(-1), 'destroy');
  }
});

test('alta: ADMIN activo confirma usuario y auditoría después de bloquear/revalidar actor', async () => {
  const { state, service } = fixture();
  const user = await service.create(body, '1');
  assert.equal(user.id, '9');
  assert.equal(state.users.size, 3);
  assert.equal(state.audits.length, 1);
  assert.deepEqual(state.audits[0].slice(0, 4), ['1', 'CREAR_USUARIO', 'usuarios', '9']);
  const events = state.events[0];
  assert(events.indexOf('lock-acquired:1') < events.indexOf('insert'));
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

test('alta: actor inexistente, inactivo o con rol revocado no inserta ni audita', async () => {
  for (const [actor, status] of [[null, 401], [testUser('1', 'ADMIN', { activo: 0 }), 401],
    [testUser('1', 'REGISTRADOR'), 403], [testUser('1', 'SUBDIRECCION'), 403]]) {
    const { state, service } = fixture();
    if (actor) state.users.set('1', actor); else state.users.delete('1');
    await assert.rejects(service.create(body, '1'), { status });
    assert.equal(state.users.has('9'), false);
    assert.equal(state.audits.length, 0);
    assert.equal(state.events[0].includes('insert'), false);
    assert.deepEqual(state.events[0].slice(-2), ['rollback', 'release']);
  }
});

test('alta: fallos de bloqueo/inserción/auditoría revierten sin persistencia y preservan error', async () => {
  for (const failAt of ['lock', 'insert', 'audit']) {
    const { state, service } = fixture();
    state.failAt = failAt;
    state.error = new Error('Error principal ficticio');
    await assert.rejects(service.create(body, '1'), error => error === state.error);
    assert.equal(state.users.has('9'), false);
    assert.equal(state.audits.length, 0);
    assert.deepEqual(state.events[0].slice(-2), ['rollback', 'release']);
  }
});

test('alta: COMMIT incierto descarta sin reintentos aunque haya confirmado usuario y auditoría', async () => {
  for (const failAt of ['commit', 'commit-after']) {
    const { state, service } = fixture();
    state.failAt = failAt;
    state.error = new Error('COMMIT ficticio');
    await assert.rejects(service.create(body, '1'), error => error === state.error);
    assert.equal(state.users.has('9'), failAt === 'commit-after');
    assert.equal(state.audits.length, failAt === 'commit-after' ? 1 : 0);
    assert.equal(state.events.length, 1);
    assert.deepEqual(state.events[0].slice(-3), ['commit', 'rollback', 'destroy']);
  }
});

test('alta: deadlock/timeout al bloquear devuelven 409 sin insertar ni reintentar', async () => {
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const { state, service } = fixture();
    state.failAt = 'lock';
    state.error = Object.assign(new Error('Bloqueo ficticio'), { code });
    await assert.rejects(service.create(body, '1'), { status: 409 });
    assert.equal(state.users.has('9'), false);
    assert.equal(state.audits.length, 0);
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].includes('insert'), false);
    assert.deepEqual(state.events[0].slice(-2), ['rollback', 'release']);
  }
});

test('alta: rollback fallido no oculta el rechazo del actor y descarta la conexión', async () => {
  const { state, service } = fixture();
  state.users.get('1').activo = 0;
  state.rollbackFails = true;
  await assert.rejects(service.create(body, '1'), { status: 401 });
  assert.equal(state.users.has('9'), false);
  assert.equal(state.audits.length, 0);
  assert.deepEqual(state.events[0].slice(-2), ['rollback', 'destroy']);
  assert.equal(state.events[0].includes('release'), false);
});

test('alta y revocación concurrentes: el primero en bloquear determina la autorización', async () => {
  for (const createFirst of [false, true]) {
    const patch = { activo: false };
    const { state, service } = fixture();
    state.users.set('7', testUser('7', 'SUPERUSUARIO'));
    state.users.set('8', testUser('8'));
    state.pauseNextLock = true;
    const create = () => service.create(body, '1');
    const revoke = () => service.update('1', patch, '7', Object.hasOwn(patch, 'activo'));
    const first = createFirst ? create() : revoke();
    await state.locked.promise;
    state.waiting = Promise.withResolvers();
    const second = createFirst ? revoke() : create();
    const resultsPromise = Promise.allSettled([first, second]);
    await state.waiting.promise;
    assert.equal(state.users.has('9'), false);
    assert.equal(state.audits.length, 0);
    state.resume.resolve();
    const results = await resultsPromise;
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, createFirst ? 'fulfilled' : 'rejected');
    if (!createFirst) assert.equal(results[1].reason.status, 401);
    assert.equal(state.users.has('9'), createFirst);
    assert.equal(state.audits.length, createFirst ? 2 : 1);
    assert.equal(state.users.get('1')[Object.keys(patch)[0]], Object.values(patch)[0]);
  }
});
