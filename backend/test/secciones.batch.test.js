import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { validateSectionBatch } from '../src/modules/organizacion-escolar/secciones/validation.js';
import { sectionsPool, sectionBody } from '../test-support/secciones-pool.js';

const sub = { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'SECUNDARIA' };
const input = { anio_escolar_id: sectionBody.anio_escolar_id, nivel: 'SECUNDARIA', grado: 1,
  letra_desde: 'A', letra_hasta: 'E' };
const actors = new Map(['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO'].map((rol, index) =>
  [String(index + 1), { ...sub, id: String(index + 1), rol }]));
let state, service, server, base;
const tokens = createTokenService(() => ({ secret: 'SecretoFicticioSoloMocksSeccionesLote-12345678', expiresIn: 900 }));
beforeEach(() => {
  state = sectionsPool({ actor: { ...sub } });
  service = createSeccionesService({ repository: createSeccionesRepository(() => state.pool),
    usuariosService: { async supervisionLevels(current, connection) {
      assert.ok(connection); return [current.nivel_asignado, ...(state.additionalLevels ?? [])];
    } } });
});
before(async () => {
  const authService = createAuthService({ tokens, repository: { findById: async id => actors.get(id) } });
  const seccionesService = { createBatch: (...args) => service.createBatch(...args) };
  server = createApp({ authService, seccionesService }).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/secciones/lote`;
});
after(async () => { if (server?.listening) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
const post = (body = input, id = '2') => fetch(base, { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(id ? { Authorization: `Bearer ${tokens.issue(id).access_token}` } : {}) },
  body: JSON.stringify(body) });

test('A-E crea cinco secciones y cinco auditorías en una conexión y un COMMIT', async () => {
  const response = await post();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { secciones } = await response.json();
  assert.deepEqual(secciones.map(row => [row.grado, row.letra]), ['A', 'B', 'C', 'D', 'E'].map(letter => [1, letter]));
  assert.ok(secciones.every(row => row.activo && row.turno === null && typeof row.id === 'string'));
  assert.equal(new Set(secciones.map(row => row.id)).size, 5);
  assert.equal(state.events.length, 1);
  assert.equal(state.rows.length, 5); assert.equal(state.audits.length, 5);
  const calls = state.events[0].filter(event => event.sql);
  assert.match(calls[0].sql, /FROM usuarios.*FOR UPDATE$/);
  assert.match(calls[1].sql, /FROM anios_escolares.*FOR UPDATE$/);
  assert.match(calls[2].sql, /SELECT letra FROM secciones[\s\S]*FOR UPDATE$/);
  assert.deepEqual(calls[2].params.slice(3), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(state.events[0].filter(event => event === 'commit').length, 1);
  assert.deepEqual(state.events[0].slice(-2), ['commit', 'release']);
  assert.deepEqual(state.audits.map(row => JSON.parse(row[5]).letra), ['A', 'B', 'C', 'D', 'E']);
});

test('rangos, tipos, grados, año y campos ajenos inválidos no abren transacción', async () => {
  for (const patch of [{ letra_desde: 'Z', letra_hasta: 'A' }, { letra_desde: 'AA' }, { letra_hasta: 'Ñ' },
    { letra_desde: 'a' }, { letra_desde: ['A'] }, { letra_hasta: null }, { letra_desde: 1 },
    { grado: 6 }, { grado: '1' }, { nivel: 'INICIAL', grado: 3 }, { nivel: 'OTRO' },
    { anio_escolar_id: '0' }, { turno: 'MAÑANA' }, { activo: true }]) {
    await assert.rejects(service.createBatch({ ...input, ...patch }, sub), { status: 400 });
  }
  assert.equal(state.events.length, 0);
  assert.equal(validateSectionBatch({ ...input, letra_desde: 'Z', letra_hasta: 'Z' }).length, 1);
  assert.equal(validateSectionBatch({ ...input, letra_hasta: 'Z' }).length, 26);
  assert.equal(validateSectionBatch({ ...input, nivel: 'INICIAL', grado: 4 }).length, 5);
  assert.equal(validateSectionBatch({ ...input, nivel: 'PRIMARIA', grado: 6 }).length, 5);
});

test('API rechaza ADMIN, REGISTRADOR, SUPERUSUARIO y ausencia de JWT antes de escribir', async () => {
  for (const [id, expected] of [['1', 403], ['3', 403], ['4', 403], ['', 401]]) {
    const response = await post(input, id); assert.equal(response.status, expected); await response.text();
  }
  for (const actor of [actors.get('1'), actors.get('3'), actors.get('4')]) {
    await assert.rejects(service.createBatch(input, actor), { status: 403 });
  }
  assert.equal(state.events.length, 0); assert.equal(state.rows.length, 0);
});

test('nivel no autorizado se rechaza; adicionales explícitos de gestión se conservan', async () => {
  await assert.rejects(service.createBatch({ ...input, nivel: 'INICIAL', grado: 4 }, sub), { status: 403 });
  const response = await post({ ...input, nivel: 'INICIAL', grado: 4 });
  assert.equal(response.status, 403); await response.text();
  assert.equal(state.rows.length, 0);
  state.additionalLevels = ['INICIAL'];
  assert.equal((await service.createBatch({ ...input, nivel: 'INICIAL', grado: 4 }, sub)).length, 5);
});

test('actor y ámbito se revalidan bajo bloqueo; año cerrado/inexistente no escribe', async () => {
  const original = state.actor;
  for (const actor of [{ ...sub, rol: 'ADMIN' }, { ...sub, activo: 0 }, { ...sub, nivel_asignado: 'PRIMARIA' }]) {
    state.beforeActor = () => { state.actor = actor; };
    await assert.rejects(service.createBatch(input, sub), { status: actor.activo ? 403 : 401 });
  }
  state.beforeActor = undefined; state.actor = original;
  for (const year of [{ ...state.year, estado: 'CERRADO' }, null]) {
    state.year = year; await assert.rejects(service.createBatch(input, sub), { status: year ? 409 : 404 });
  }
  assert.equal(state.rows.length, 0); assert.equal(state.audits.length, 0);
});

test('duplicado incluso inactivo o con diferencia de mayúscula/acento impide todo el lote', async () => {
  for (const letter of ['C', 'c', 'Ç']) {
    state.rows = [{ id: '8', anio_escolar_id: input.anio_escolar_id, nivel: input.nivel, grado: 1, letra: letter, activo: false }];
    const response = await post(); assert.equal(response.status, 409);
    assert.match((await response.json()).error, /No se creó ninguna/);
    assert.equal(state.rows.length, 1); assert.equal(state.audits.length, 0);
    assert.equal(state.events.at(-1).some(event => event.sql?.startsWith('INSERT')), false);
  }
});

test('fallo tardío de inserción o auditoría revierte todas las filas y eventos', async () => {
  for (const failure of ['failInsertAt', 'failAuditAt']) {
    state[failure] = 3;
    await assert.rejects(service.createBatch(input, sub), error => error === state.error);
    assert.equal(state.rows.length, 0); assert.equal(state.audits.length, 0);
    assert.deepEqual(state.events.at(-1).slice(-2), ['rollback', 'release']);
    assert.equal(state.events.at(-1).includes('commit'), false); delete state[failure];
  }
});

test('dos lotes concurrentes: solo uno confirma; el otro rechaza sin parcialidad', async () => {
  const results = await Promise.allSettled([service.createBatch(input, sub), service.createBatch(input, sub)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal(state.rows.length, 5); assert.equal(state.audits.length, 5);
});

test('COMMIT incierto conserva el error y descarta la conexión, sin reintentar', async () => {
  state.commitFailsAfterPersist = true;
  await assert.rejects(service.createBatch(input, sub), error => error === state.error);
  assert.equal(state.rows.length, 5); assert.equal(state.audits.length, 5);
  assert.equal(state.events.length, 1); assert.equal(state.events[0].at(-1), 'destroy');
});
