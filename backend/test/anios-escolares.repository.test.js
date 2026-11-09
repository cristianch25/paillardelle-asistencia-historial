import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares.repository.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares.service.js';

test('repositorio: SELECT parametrizados, campos explícitos, orden estable y ausencia de escrituras', async () => {
  const calls = [];
  const repository = createAniosEscolaresRepository(() => ({
    async execute(sql, params) { calls.push({ sql, params }); return [[]]; },
  }));
  assert.deepEqual(await repository.list({ limit: 21, offset: 20 }), []);
  const id = '18446744073709551615';
  assert.equal(await repository.findById(id), null);
  const columns = 'id, anio, fecha_inicio, fecha_fin, estado, created_at, updated_at';
  assert.equal(calls[0].sql, `SELECT ${columns} FROM anios_escolares ORDER BY id ASC LIMIT ? OFFSET ?`);
  assert.deepEqual(calls[0].params, [21, 20]);
  assert.equal(calls[1].sql, `SELECT ${columns} FROM anios_escolares WHERE id = ? LIMIT 1`);
  assert.deepEqual(calls[1].params, [id]);
  assert.equal(calls.some(({ sql }) => /INSERT|UPDATE|DELETE|ALTER|DROP|SELECT \*/.test(sql)), false);
  assert.equal(calls.some(({ sql }) => sql.includes(id)), false);
});

test('repositorio y servicio preservan los campos públicos, fechas e IDs de gran precisión', async () => {
  const calls = [];
  const row = { id: '18446744073709551615', anio: 2026, estado: 'CERRADO',
    fecha_inicio: '2026-03-01', fecha_fin: '2026-12-20',
    created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' };
  const repository = createAniosEscolaresRepository(() => ({
    async execute(_sql, params) { calls.push(params); return [[{ ...row, interno: 'privado' }]]; },
  }));
  const service = createAniosEscolaresService({ repository });
  assert.deepEqual(await service.findById(row.id), row);
  assert.deepEqual((await service.list()).anios_escolares, [row]);
  assert.deepEqual(calls, [[row.id], [21, 0]]);
});

test('IDs BIGINT UNSIGNED inválidos se rechazan antes de consultar, sin conversiones a Number', async () => {
  const requested = [];
  const service = createAniosEscolaresService({ repository: {
    async findById(id) { requested.push(id); return { id }; },
  } });
  for (const id of ['1', '9007199254740993', '18446744073709551615']) {
    assert.equal((await service.findById(id)).id, id);
  }
  for (const id of [undefined, null, 1, 9007199254740992, '', '0', '01', '+1', '-1',
    '1.0', '1e2', ' 1', '1 ', '1 OR 1=1', '18446744073709551616', '9'.repeat(30)]) {
    await assert.rejects(service.findById(id), { status: 400 });
  }
  assert.deepEqual(requested, ['1', '9007199254740993', '18446744073709551615']);
});

test('paginación solicita una fila extra y valida límites y offset antes de consultar', async () => {
  const calls = [];
  const service = createAniosEscolaresService({ repository: {
    async list(options) {
      calls.push(options);
      return Array.from({ length: options.limit }, (_, i) => ({ id: String(i + 1) }));
    },
  } });
  let result = await service.list();
  assert.deepEqual(calls[0], { limit: 21, offset: 0 });
  assert.equal(result.anios_escolares.length, 20);
  assert.deepEqual(result.pagination, { page: 1, limit: 20, has_more: true });
  result = await service.list({ page: '2', limit: '100' });
  assert.deepEqual(calls[1], { limit: 101, offset: 100 });
  assert.equal(result.anios_escolares.length, 100);
  for (const query of [{ page: '' }, { page: '-1' }, { page: '01' }, { page: '1.5' },
    { page: '1e2' }, { page: ['1', '2'] }, { page: '9007199254740992' },
    { page: '9007199254740991', limit: '100' }, { limit: '0' }, { limit: '101' },
    { limit: '' }, { limit: 'abc' }, { limit: { value: '20' } }]) {
    await assert.rejects(service.list(query), { status: 400 });
  }
  assert.equal(calls.length, 2);
});

test('tabla vacía, página final completa y detalle inexistente', async () => {
  const service = createAniosEscolaresService({ repository: {
    list: async () => [], findById: async () => null,
  } });
  assert.deepEqual(await service.list(), {
    anios_escolares: [], pagination: { page: 1, limit: 20, has_more: false },
  });
  await assert.rejects(service.findById('1'), { status: 404 });
  const end = createAniosEscolaresService({ repository: { list: async () => [{ id: '1' }, { id: '2' }] } });
  assert.equal((await end.list({ limit: '2' })).pagination.has_more, false);
});
