import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares.repository.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares.service.js';
import { payload, yearPool } from '../test-support/anios-create-pool.js';

const tokens = createTokenService(() => ({
  secret: 'secreto-ficticio-anios-create-solo-pruebas-12345678', expiresIn: 900,
}));
const users = new Map(['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'ADMIN'].map((rol, i) => {
  const id = String(i + 1);
  return [id, { id, rol, activo: i === 3 ? 0 : 1 }];
}));
let server, url, state;
before(async () => {
  const authService = createAuthService({ tokens, repository: { findById: async id => users.get(id) } });
  const repository = createAniosEscolaresRepository(() => state.pool);
  const aniosEscolaresService = createAniosEscolaresService({ repository });
  server = createApp({ authService, aniosEscolaresService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/anios-escolares`;
});
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});
function post(body = payload, token = tokens.issue('1').access_token, raw = false) {
  return fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: raw ? body : JSON.stringify(body) });
}

test('POST ADMIN responde 201 con Location, campos públicos e ID BIGINT de texto', async () => {
  state = yearPool();
  const response = await post();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('location'), '/api/anios-escolares/9007199254740993');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { anio_escolar: year } = await response.json();
  assert.deepEqual(year, state.years[0]);
  assert.equal(year.id, '9007199254740993');
  assert.equal(year.estado, 'PLANIFICADO');
  assert.equal(state.audits.length, 1);
});

test('POST exige JWT y ADMIN activo antes de adquirir conexiones', async () => {
  state = yearPool();
  for (const [token, status] of [['', 401], ['invalido', 401],
    [tokens.issue('2').access_token, 403], [tokens.issue('3').access_token, 403],
    [tokens.issue('4').access_token, 401], [tokens.issue('999').access_token, 401]]) {
    const response = await post(payload, token);
    assert.equal(response.status, status);
    await response.text();
  }
  assert.equal(state.transactions.length, 0);
});

test('POST rechaza estado incluso PLANIFICADO, campos internos, tipos y fechas inválidas', async () => {
  state = yearPool();
  for (const body of [{}, null, [], { ...payload, anio: '2026' }, { ...payload, anio: 2201 },
    { ...payload, estado: 'PLANIFICADO' }, { ...payload, estado: 'ABIERTO' },
    { ...payload, estado: 'CERRADO' }, { ...payload, id: '1' },
    { ...payload, fecha_inicio: '2026-02-29' }, { ...payload, fecha_fin: '2026-01-01' }]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    await response.text();
  }
  const malformed = await post('{', undefined, true);
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'JSON no válido.' });
  const large = await post({ ...payload, extra: 'x'.repeat(9000) });
  assert.equal(large.status, 413);
  await large.text();
  assert.equal(state.transactions.length, 0);
});

test('POST duplicado secuencial y concurrente devuelve 409 sin duplicar auditoría', async () => {
  state = yearPool();
  const responses = await Promise.all([post(), post()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  for (const response of responses) await response.text();
  const duplicate = await post();
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: 'El año escolar ya está registrado.' });
  assert.equal(state.years.length, 1);
  assert.equal(state.audits.length, 1);
});

test('POST revalida el actor bloqueado aunque autenticación previa permitiera ADMIN', async () => {
  for (const [actor, status] of [[null, 401], [{ activo: 0, rol: 'ADMIN' }, 401],
    [{ activo: 1, rol: 'SUBDIRECCION' }, 403]]) {
    state = yearPool({ beforeActorRead: async () => { state.actor = actor; } });
    const response = await post();
    assert.equal(response.status, status);
    await response.text();
    assert.equal(state.years.length, 0);
    assert.equal(state.audits.length, 0);
  }
});

test('POST fallos de inserción/auditoría y bloqueos conservan errores HTTP seguros', async () => {
  for (const failAt of ['insert', 'audit']) {
    state = yearPool({ failAt });
    const response = await post();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
    assert.equal(state.years.length, 0);
    assert.equal(state.audits.length, 0);
  }
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    state = yearPool({ failAt: 'actor', error: Object.assign(new Error('SQL privado'), { code }) });
    const response = await post();
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'Conflicto concurrente: vuelve a intentar la operación.' });
  }
});
