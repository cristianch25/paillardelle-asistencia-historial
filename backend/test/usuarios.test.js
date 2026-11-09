import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';

// Usuarios ficticios y repositorios en memoria: ninguna consulta a MySQL.
const records = new Map(['ADMIN', 'REGISTRADOR', 'SUBDIRECCION', 'ADMIN'].map((rol, index) => {
  const id = String(index + 1);
  return [id, {
    id, nombres: 'Nombre ficticio', apellidos: 'Apellido ficticio', usuario: `usuario${id}`,
    rol, cargo: null, nivel_asignado: rol === 'SUBDIRECCION' ? 'PRIMARIA' : null,
    activo: index === 3 ? 0 : 1, puede_escanear_qr: 0, puede_usar_bitacora: 0,
    created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00',
    password_hash: 'dato_ficticio_que_no_debe_salir', password: 'tampoco', secret: 'tampoco',
  }];
}));
const secret = 'secreto-ficticio-exclusivo-de-pruebas-usuarios-123456';
const tokens = createTokenService(() => ({ secret, expiresIn: 900 }));
let server;
let baseUrl;
let queries = 0;
let databaseFails = false;

before(async () => {
  const authService = createAuthService({
    repository: { findById: async id => records.get(id) ?? null }, tokens,
  });
  const usuariosService = createUsuariosService({ repository: {
    async list({ limit, offset }) {
      queries++;
      if (databaseFails) throw new Error('SQL, contraseña y datos de conexión privados');
      return [...records.values()].slice(offset, offset + limit);
    },
    async findById(id) {
      queries++;
      if (databaseFails) throw new Error('SQL privado');
      return records.get(id) ?? null;
    },
  } });
  server = createApp({ authService, usuariosService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function request(path = '', token = tokens.issue('1').access_token) {
  return fetch(`${baseUrl}/api/usuarios${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

test('ADMIN obtiene listado paginado y detalle sin campos sensibles', async () => {
  const response = await request('?page=1&limit=2');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.users.length, 2);
  assert.deepEqual(body.pagination, { page: 1, limit: 2, has_more: true });
  const detail = await request('/1');
  assert.equal(detail.status, 200);
  const { user } = await detail.json();
  assert.deepEqual(user, body.users[0]);
  assert.equal(user.id, '1');
  assert.equal(user.activo, true);
  for (const record of [user, ...body.users]) {
    for (const field of ['password_hash', 'password', 'secret']) assert.equal(Object.hasOwn(record, field), false);
  }
});

test('sin JWT válido ambos endpoints devuelven 401 antes de consultar usuarios', async () => {
  const expired = createTokenService(() => ({ secret, expiresIn: -1 })).issue('1').access_token;
  const prior = queries;
  for (const token of ['', 'invalido', `${tokens.issue('1').access_token}x`, expired, tokens.issue('4').access_token]) {
    for (const path of ['', '/1']) {
      const response = await request(path, token);
      assert.equal(response.status, 401);
      await response.text();
    }
  }
  assert.equal(queries, prior);
});

test('REGISTRADOR y SUBDIRECCION reciben 403 en ambas consultas', async () => {
  const prior = queries;
  for (const id of ['2', '3']) for (const path of ['', '/1']) {
    const response = await request(path, tokens.issue(id).access_token);
    assert.equal(response.status, 403);
    await response.text();
  }
  assert.equal(queries, prior);
});

test('se comprueba el rol actual aunque el token se emitiera siendo ADMIN', async () => {
  const token = tokens.issue('1').access_token;
  try {
    records.get('1').rol = 'REGISTRADOR';
    const response = await request('', token);
    assert.equal(response.status, 403);
    await response.text();
  } finally { records.get('1').rol = 'ADMIN'; }
});

test('ID y paginación inválidos devuelven 400; usuario inexistente devuelve 404', async () => {
  for (const path of ['/0', '/-1', '/abc', '/1.5', '/18446744073709551616', '/%E0%A4%A', '?limit=101', '?page=0', '?limit=1&limit=2']) {
    const response = await request(path);
    assert.equal(response.status, 400);
    await response.text();
  }
  const response = await request('/999');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Usuario no encontrado.' });
});

test('página sin resultados responde 200 y los errores internos responden 500 seguro', async () => {
  let response = await request('?page=100');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { users: [], pagination: { page: 100, limit: 20, has_more: false } });
  databaseFails = true;
  try {
    for (const path of ['', '/1']) {
      response = await request(path);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
    }
  } finally { databaseFails = false; }
});
