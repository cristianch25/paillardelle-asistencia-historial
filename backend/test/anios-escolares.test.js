import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createAniosEscolaresService } from '../src/modules/organizacion-escolar/anios-escolares.service.js';

// JWT reales y repositorios ficticios: ninguna conexión MySQL.
const users = new Map(['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'OTRO'].map((rol, i) => {
  const id = String(i + 1);
  return [id, { id, rol, activo: 1, nivel_asignado: rol === 'SUBDIRECCION' ? 'PRIMARIA' : null }];
}));
const years = ['PLANIFICADO', 'ABIERTO', 'CERRADO'].map((estado, i) => ({
  id: String(i + 1), anio: 2025 + i, estado,
  fecha_inicio: `${2025 + i}-03-01`, fecha_fin: `${2025 + i}-12-20`,
  created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00',
  interno: 'no debe salir',
}));
const secret = 'secreto-ficticio-exclusivo-de-pruebas-anios-12345678';
const tokens = createTokenService(() => ({ secret, expiresIn: 900 }));
let server, baseUrl;
let queries = 0;
let databaseFails = false;

before(async () => {
  const authService = createAuthService({ tokens, repository: {
    findById: async id => users.get(id) ?? null,
  } });
  const aniosEscolaresService = createAniosEscolaresService({ repository: {
    async list({ limit, offset }) {
      queries++;
      if (databaseFails) throw new Error('SELECT privado, credenciales MySQL');
      return years.slice(offset, offset + limit);
    },
    async findById(id) {
      queries++;
      if (databaseFails) throw new Error('SELECT privado, credenciales MySQL');
      return years.find(row => row.id === id) ?? null;
    },
  } });
  server = createApp({ authService, aniosEscolaresService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/api/anios-escolares`;
});
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});
function request(path = '', token = tokens.issue('1').access_token, method = 'GET') {
  return fetch(`${baseUrl}${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

test('los tres roles consultan listado, barra final y detalle de todos los estados', async () => {
  for (const id of ['1', '2', '3']) for (const path of ['', '/', '/1', '/2', '/3']) {
    const response = await request(path, tokens.issue(id).access_token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    const rows = body.anios_escolares ?? [body.anio_escolar];
    assert.equal(rows.some(row => Object.hasOwn(row, 'interno')), false);
    assert.equal(typeof rows[0].id, 'string');
    assert.equal(typeof rows[0].fecha_inicio, 'string');
  }
});

test('JWT ausente, inválido, alterado, vencido o usuario inexistente/inactivo devuelve 401', async () => {
  const expired = createTokenService(() => ({ secret, expiresIn: -1 })).issue('1').access_token;
  const prior = queries;
  users.set('5', { id: '5', rol: 'REGISTRADOR', activo: 0 });
  for (const token of ['', 'invalido', `${tokens.issue('1').access_token}x`, expired,
    tokens.issue('5').access_token, tokens.issue('999').access_token]) {
    for (const path of ['', '/1']) {
      const response = await request(path, token);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('www-authenticate'), 'Bearer');
      await response.text();
    }
  }
  assert.equal(queries, prior);
});

test('rol desconocido recibe 403 y la desactivación posterior al JWT se aplica inmediatamente', async () => {
  const token = tokens.issue('3').access_token;
  const prior = queries;
  try {
    users.get('3').activo = 0;
    for (const path of ['', '/1']) {
      const denied = await request(path, tokens.issue('4').access_token);
      assert.equal(denied.status, 403);
      await denied.text();
      const inactive = await request(path, token);
      assert.equal(inactive.status, 401);
      await inactive.text();
    }
  } finally { users.get('3').activo = 1; }
  assert.equal(queries, prior);
});

test('paginación y resultados vacíos mantienen el contrato HTTP', async () => {
  let response = await request('?page=2&limit=2');
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.pagination, { page: 2, limit: 2, has_more: false });
  assert.deepEqual(body.anios_escolares.map(row => row.id), ['3']);
  response = await request('?limit=2');
  assert.equal((await response.json()).pagination.has_more, true);
  response = await request('?page=100');
  assert.equal(response.status, 200);
  body = await response.json();
  assert.deepEqual(body, { anios_escolares: [], pagination: { page: 100, limit: 20, has_more: false } });
});

test('parámetros inválidos reciben 400 y un ID válido inexistente recibe 404', async () => {
  for (const path of ['/0', '/01', '/-1', '/abc', '/1.5', '/18446744073709551616',
    '/%E0%A4%A', '?page=0', '?limit=101', '?limit=1&limit=2', '?page=1&page=2']) {
    const response = await request(path);
    assert.equal(response.status, 400);
    await response.text();
  }
  const response = await request('/18446744073709551615');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Año escolar no encontrado.' });
});

test('fallos internos responden JSON genérico sin SQL ni credenciales', async () => {
  databaseFails = true;
  try {
    for (const path of ['', '/1']) {
      const response = await request(path);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
    }
  } finally { databaseFails = false; }
});

test('no existen PATCH ni DELETE de años escolares ni POST sobre un ID', async () => {
  const prior = queries;
  for (const [method, path] of [['POST', '/1'], ['PATCH', ''], ['PATCH', '/1'], ['DELETE', ''], ['DELETE', '/1']]) {
    const response = await request(path, tokens.issue('1').access_token, method);
    assert.equal(response.status, 404);
    await response.text();
  }
  assert.equal(queries, prior);
});
