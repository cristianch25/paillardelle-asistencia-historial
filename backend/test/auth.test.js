import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService, readAuthConfig } from '../src/modules/auth/auth.tokens.js';

// Solo datos ficticios en memoria. No se usa el repositorio MySQL.
const secret = 'secreto-ficticio-exclusivo-de-pruebas-123456789';
const password = 'ClaveFicticia123!';
const records = new Map();
let server;
let baseUrl;
let accessToken;
let databaseFails = false;

before(async () => {
  const hash = await bcrypt.hash(password, 4); // Coste reducido solo en fixtures.
  const user = {
    id: '9007199254740993', nombres: 'Usuario', apellidos: 'Ficticio',
    usuario: 'prueba', password_hash: hash, rol: 'REGISTRADOR', cargo: 'DOCENTE',
    nivel_asignado: null, puede_escanear_qr: 0, puede_usar_bitacora: 0, activo: 1,
  };
  records.set('prueba', user);
  records.set('inactivo', { ...user, id: '2', usuario: 'inactivo', activo: 0 });
  const repository = {
    async findByUsername(username) {
      if (databaseFails) throw new Error('SQL y secreto ficticio que no deben salir');
      return records.get(username) ?? null;
    },
    async findById(id) {
      return [...records.values()].find(record => record.id === id) ?? null;
    },
  };
  const tokens = createTokenService(() => ({ secret, expiresIn: 900 }));
  const service = createAuthService({ repository, tokens });
  server = createApp({ authService: service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
});

function login(body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function me(token) {
  return fetch(`${baseUrl}/api/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

test('login correcto emite JWT y datos básicos sin password ni hash', async () => {
  const response = await login({ usuario: 'prueba', password });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  accessToken = body.access_token;
  assert.equal(body.token_type, 'Bearer');
  assert.equal(body.expires_in, 900);
  assert.equal(body.user.id, '9007199254740993');
  assert.equal(Object.hasOwn(body.user, 'puede_escanear_qr'), false);
  assert.equal(Object.hasOwn(body.user, 'puede_usar_bitacora'), false);
  assert.equal(Object.hasOwn(body.user, 'password_hash'), false);
  assert.equal(Object.hasOwn(body.user, 'password'), false);
  const payload = jwt.verify(accessToken, secret, { algorithms: ['HS256'] });
  assert.equal(payload.sub, body.user.id);
  assert.equal(payload.exp - payload.iat, 900);
  assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'sub']);
});

test('contraseña incorrecta, usuario inexistente e inactivo comparten respuesta 401', async () => {
  const bodies = [];
  for (const credentials of [
    { usuario: 'prueba', password: 'Incorrecta' },
    { usuario: 'no-existe', password },
    { usuario: 'inactivo', password },
    { usuario: "' OR 1=1 --", password },
  ]) {
    const response = await login(credentials);
    assert.equal(response.status, 401);
    bodies.push(await response.json());
  }
  for (const body of bodies) assert.deepEqual(body, bodies[0]);
});

test('login rechaza campos ausentes, tipos incorrectos y más de 72 bytes UTF-8', async () => {
  for (const body of [null, {}, { usuario: 1, password },
    { usuario: 'prueba', password: 1 }, { usuario: 'prueba', password: '' },
    { usuario: 'x'.repeat(61), password },
    { usuario: 'prueba', password: 'á'.repeat(37) }]) {
    const response = await login(body);
    assert.equal(response.status, 400);
    await response.text();
  }
});

test('JSON malformado y solicitudes excesivas tienen errores seguros', async () => {
  for (const [body, status] of [['{malformado', 400], ['"' + 'x'.repeat(9000) + '"', 413]]) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    assert.equal(response.status, status);
    assert.deepEqual(Object.keys(await response.json()), ['error']);
  }
});

test('me autenticado devuelve perfil actual y conserva BIGINT sin pérdida', async () => {
  const user = records.get('prueba');
  user.cargo = 'CARGO ACTUALIZADO';
  const response = await me(accessToken);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.id, user.id);
  assert.equal(body.user.cargo, user.cargo);
  assert.equal(Object.hasOwn(body.user, 'puede_escanear_qr'), false);
  assert.equal(Object.hasOwn(body.user, 'puede_usar_bitacora'), false);
  assert.equal(Object.hasOwn(body.user, 'password_hash'), false);
});

test('me rechaza ausencia de token, token alterado, vencido o sin vencimiento', async () => {
  const sign = options => jwt.sign({}, secret, {
    subject: '9007199254740993', issuer: 'paillardelle-asistencia',
    audience: 'paillardelle-asistencia-api', ...options,
  });
  for (const token of [undefined, 'no-es-jwt', `${accessToken}alterado`,
    sign({ expiresIn: -1 }), sign({}), sign({ expiresIn: 900, algorithm: 'HS384' }),
    sign({ expiresIn: 900, audience: 'otra-api' }),
    sign({ expiresIn: 900, issuer: 'otro-emisor' }),
    sign({ expiresIn: 900, subject: 'invalido' })]) {
    const response = await me(token);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    await response.text();
  }
});

test('desactivar o retirar el usuario invalida el acceso aunque el JWT no haya vencido', async () => {
  const user = records.get('prueba');
  try {
    user.activo = 0;
    let response = await me(accessToken);
    assert.equal(response.status, 401);
    await response.text();
    records.delete('prueba');
    response = await me(accessToken);
    assert.equal(response.status, 401);
    await response.text();
  } finally {
    user.activo = 1;
    records.set('prueba', user);
  }
});

test('errores internos no exponen mensajes del repositorio', async () => {
  databaseFails = true;
  try {
    const response = await login({ usuario: 'prueba', password });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
  } finally {
    databaseFails = false;
  }
});

test('secretos ausentes o débiles y vencimientos inválidos impiden emitir tokens', () => {
  for (const env of [{}, { AUTH_JWT_SECRET: 'corto' },
    { AUTH_JWT_SECRET: ' '.repeat(32) },
    { AUTH_JWT_SECRET: secret, AUTH_JWT_EXPIRES_IN_SECONDS: '0' },
    { AUTH_JWT_SECRET: secret, AUTH_JWT_EXPIRES_IN_SECONDS: 'abc' }]) {
    assert.throws(() => readAuthConfig(env), { status: 503 });
  }
  assert.equal(readAuthConfig({ AUTH_JWT_SECRET: secret }).expiresIn, 900);
});

test('un password_hash inválido nunca se compara como contraseña en texto plano', async () => {
  const original = records.get('prueba');
  records.set('prueba', { ...original, password_hash: password });
  try {
    const response = await login({ usuario: 'prueba', password });
    assert.equal(response.status, 401);
    await response.text();
  } finally {
    records.set('prueba', original);
  }
});

test('sin secreto configurado auth responde 503 y health continúa funcionando', async () => {
  const service = createAuthService({
    repository: {
      findByUsername() { throw new Error('No debe consultar MySQL sin configuración.'); },
    },
    tokens: createTokenService(() => readAuthConfig({})),
  });
  const isolatedServer = createApp({ authService: service }).listen(0, '127.0.0.1');
  await once(isolatedServer, 'listening');
  const url = `http://127.0.0.1:${isolatedServer.address().port}`;
  try {
    const authResponse = await fetch(`${url}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'prueba', password }),
    });
    assert.equal(authResponse.status, 503);
    await authResponse.text();
    const healthResponse = await fetch(`${url}/api/health`);
    assert.equal(healthResponse.status, 200);
    await healthResponse.text();
  } finally {
    await new Promise((resolve, reject) => {
      isolatedServer.close(error => (error ? reject(error) : resolve()));
    });
  }
});
