import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
const actor = { rol: 'ADMIN' };
const roles = ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'];

test('repositorio: SELECT explícitos y parametrizados con orden y límite', async () => {
  const calls = [];
  const repository = createUsuariosRepository(() => ({
    async execute(sql, params) { calls.push({ sql, params }); return [[]]; },
  }));
  assert.deepEqual(await repository.list({ limit: 21, offset: 20, roles }), []);
  const id = '18446744073709551615';
  assert.equal(await repository.findById(id), null);
  assert.match(calls[0].sql, /FROM usuarios WHERE rol IN \(\?, \?, \?\)\s+ORDER BY id ASC LIMIT \? OFFSET \?$/);
  assert.deepEqual(calls[0].params, [...roles, 21, 20]);
  assert.match(calls[1].sql, /FROM usuarios WHERE id = \? LIMIT 1$/);
  assert.deepEqual(calls[1].params, [id]);
  for (const { sql } of calls) {
    assert.match(sql, /^SELECT /);
    assert.equal(/password_hash|SELECT \*|INSERT|UPDATE|DELETE|ALTER|DROP/.test(sql), false);
    assert.equal(sql.includes(id), false);
  }
});

test('servicio: conserva IDs BIGINT como texto, incluido el máximo unsigned', async () => {
  const requested = [];
  const service = createUsuariosService({ repository: {
    async findById(id) {
      requested.push(id);
      return { id, activo: 1, rol: 'REGISTRADOR' };
    },
  } });
  for (const id of ['9007199254740993', '18446744073709551615']) {
    assert.equal((await service.findById(id, actor)).id, id);
  }
  assert.deepEqual(requested, ['9007199254740993', '18446744073709551615']);
  for (const id of ['', '0', '01', '+1', '-1', '1.0', '1e2', ' 1', '1 OR 1=1', '18446744073709551616', '9'.repeat(30)]) {
    await assert.rejects(service.findById(id, actor), { status: 400 });
  }
  assert.equal(requested.length, 2);
});

test('servicio: paginación por defecto, límite máximo y fin de página', async () => {
  const calls = [];
  const service = createUsuariosService({ repository: {
    async list(options) {
      calls.push(options);
      return Array.from({ length: options.limit }, (_, index) => ({ id: String(index + 1) }));
    },
  } });
  let result = await service.list({}, actor);
  assert.deepEqual(calls[0], { limit: 21, offset: 0, roles });
  assert.equal(result.users.length, 20);
  assert.equal(result.pagination.has_more, true);
  result = await service.list({ page: '2', limit: '100' }, actor);
  assert.deepEqual(calls[1], { limit: 101, offset: 100, roles });
  assert.equal(result.users.length, 100);
  const end = createUsuariosService({ repository: {
    list: async () => [{ id: '1' }, { id: '2' }],
  } });
  assert.equal((await end.list({ limit: '2' }, actor)).pagination.has_more, false);
});

test('servicio: rechaza paginaciones inválidas antes de consultar', async () => {
  let calls = 0;
  const service = createUsuariosService({ repository: {
    async list() { calls++; return []; },
  } });
  for (const query of [
    { page: '' }, { page: '-1' }, { page: '1.5' }, { page: '1e2' },
    { page: ['1', '2'] }, { page: '9007199254740992' },
    { page: '9007199254740991', limit: '100' },
    { limit: '0' }, { limit: '101' }, { limit: '' }, { limit: 'abc' },
    { limit: { value: '20' } },
  ]) await assert.rejects(service.list(query, actor), { status: 400 });
  assert.equal(calls, 0);
});
