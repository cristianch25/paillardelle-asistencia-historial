import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';

const payload = { nombres: 'Personal', apellidos: 'Ficticio', usuario: 'cuenta_ficticia',
  password: 'ClaveFicticiaSoloEnPruebas', rol: 'REGISTRADOR' };
const tokens = createTokenService(() => ({
  secret: 'secreto-ficticio-registro-usuarios-solo-pruebas-123', expiresIn: 900,
}));
let server;
let url;
let captured;
let calls = 0;
let failAt;

before(async () => {
  const authService = createAuthService({ tokens, repository: {
    findById: async id => ({ id, rol: id === '1' ? 'ADMIN' : id === '2' ? 'REGISTRADOR' : 'SUBDIRECCION', activo: 1 }),
  } });
  const repository = {
    async findByUsername(username) {
      calls++;
      if (failAt === 'lookup') throw new Error('Conexión privada');
      return username === 'existente' ? { id: '9' } : null;
    },
    async create(data, actorId, authorize) {
      calls++;
      captured = { data, actorId };
      const actor = failAt === 'missing-actor' ? null : { id: actorId,
        activo: failAt === 'inactive-actor' ? 0 : 1,
        rol: failAt === 'revoked-actor' ? 'REGISTRADOR' : 'ADMIN' };
      authorize(actor);
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(failAt)) {
        throw Object.assign(new Error('Bloqueo privado'), { code: failAt });
      }
      if (failAt === 'duplicate') throw Object.assign(new Error('Dato privado'), { code: 'ER_DUP_ENTRY' });
      if (failAt === 'insert') throw new Error('SQL con datos privados');
      return { id: '9007199254740993', cargo: null, nivel_asignado: null,
        puede_escanear_qr: 0, puede_usar_bitacora: 0, activo: 1,
        created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00', ...data };
    },
  };
  const usuariosService = createUsuariosService({ repository });
  server = createApp({ authService, usuariosService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/usuarios`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function post(body = payload, token = tokens.issue('1').access_token) {
  return fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
}

test('ADMIN registra con bcrypt de 12 rondas y recibe 201 sin contraseña ni hash', async () => {
  const response = await post();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('location'), '/api/usuarios/9007199254740993');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { user } = await response.json();
  assert.equal(user.id, '9007199254740993');
  assert.equal(user.usuario, payload.usuario);
  assert.equal(user.activo, true);
  assert.equal(Object.hasOwn(user, 'password_hash'), false);
  assert.equal(Object.hasOwn(user, 'password'), false);
  assert.equal(captured.actorId, '1');
  assert.equal(Object.hasOwn(captured.data, 'password'), false);
  assert.equal(Object.hasOwn(captured.data, 'activo'), false);
  assert.equal(bcrypt.getRounds(captured.data.password_hash), 12);
  assert.equal(await bcrypt.compare(payload.password, captured.data.password_hash), true);
});

test('ADMIN acepta los dos roles institucionales gestionables y opcionales válidos, sin inventar restricciones por cargo', async () => {
  for (const rol of ['SUBDIRECCION', 'REGISTRADOR']) {
    const response = await post({ ...payload, rol, nivel_asignado: 'SECUNDARIA',
      cargo: 'Auxiliar', puede_escanear_qr: true, puede_usar_bitacora: false, activo: false });
    assert.equal(response.status, 201);
    const { user } = await response.json();
    assert.equal(user.rol, rol);
    assert.equal(user.activo, false);
    assert.equal(user.puede_escanear_qr, true);
  }
});

test('sin JWT responde 401 y con roles insuficientes 403, antes de consultar o registrar', async () => {
  const prior = calls;
  for (const [token, status] of [['', 401], ['invalido', 401],
    [tokens.issue('2').access_token, 403], [tokens.issue('3').access_token, 403]]) {
    const response = await post(payload, token);
    assert.equal(response.status, status);
    await response.text();
  }
  assert.equal(calls, prior);
});

test('datos inválidos devuelven 400 sin consultar el repositorio', async () => {
  const prior = calls;
  for (const body of [{}, { ...payload, password: '' }, { ...payload, rol: 'OTRO' },
    { ...payload, rol: 'SUBDIRECCION' }, { ...payload, password_hash: 'no_admitido' }]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    await response.text();
  }
  assert.equal(calls, prior);
});

test('duplicado previo o error UNIQUE en el INSERT devuelven el mismo 409', async () => {
  let response = await post({ ...payload, usuario: 'existente' });
  assert.equal(response.status, 409);
  const expected = await response.json();
  failAt = 'duplicate';
  try {
    response = await post();
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), expected);
  } finally { failAt = undefined; }
});

test('errores de consulta o inserción devuelven un 500 sin datos privados', async () => {
  try {
    for (failAt of ['lookup', 'insert']) {
      const response = await post();
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
    }
  } finally { failAt = undefined; }
});

test('alta revalida al actor transaccional aunque su JWT haya autorizado la petición', async () => {
  try {
    for (const [scenario, status] of [['missing-actor', 401], ['inactive-actor', 401], ['revoked-actor', 403]]) {
      failAt = scenario;
      const response = await post();
      assert.equal(response.status, status);
      if (status === 401) assert.equal(response.headers.get('www-authenticate'), 'Bearer');
      assert.deepEqual(await response.json(), { error: status === 401
        ? 'Credenciales o autenticación no válidas.' : 'Sin permiso para consultar cuentas.' });
    }
  } finally { failAt = undefined; }
});

test('fallos de bloqueo del alta devuelven 409 seguro sin reintentos', async () => {
  try {
    for (failAt of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
      const previous = calls;
      const response = await post();
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: 'Conflicto concurrente: vuelve a intentar la operación.' });
      assert.equal(calls, previous + 2);
    }
  } finally { failAt = undefined; }
});
