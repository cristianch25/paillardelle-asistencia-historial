import assert from 'node:assert/strict';
import { once } from 'node:events';
import { afterEach, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { updatePool, testUser } from '../test-support/usuarios-update-pool.js';

const tokens = createTokenService(() => ({
  secret: 'secreto-ficticio-pruebas-PATCH-usuarios-123456789', expiresIn: 900,
}));
let state;
let server;
let baseUrl;

beforeEach(async () => {
  state = updatePool([testUser('1'), testUser('2', 'REGISTRADOR'), testUser('3', 'REGISTRADOR')]);
  const authService = createAuthService({ tokens, repository: {
    findById: async id => state.users.get(id) ?? null,
  } });
  const usuariosService = createUsuariosService({ repository: createUsuariosRepository(() => state.pool) });
  server = createApp({ authService, usuariosService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function patch(path, body, token = tokens.issue('1').access_token) {
  return fetch(`${baseUrl}/api/usuarios/${path}`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

test('ADMIN actualiza datos permitidos y recibe 200, sin contraseña ni hash', async () => {
  const response = await patch('3', { nombres: 'Nombre actualizado', cargo: null,
    nivel_asignado: 'PRIMARIA' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { user } = await response.json();
  assert.equal(user.nombres, 'Nombre actualizado');
  assert.equal(user.nivel_asignado, 'PRIMARIA');
  assert.equal(Object.hasOwn(user, 'puede_escanear_qr'), false);
  assert.equal(Object.hasOwn(user, 'puede_usar_bitacora'), false);
  assert.equal(Object.hasOwn(user, 'password_hash'), false);
  assert.equal(Object.hasOwn(user, 'password'), false);
  assert.equal(state.audits.length, 1);
});

test('PATCH rechaza indicadores retirados antes de abrir transacciones', async () => {
  for (const field of ['puede_escanear_qr', 'puede_usar_bitacora']) {
    for (const value of [true, false]) {
      const response = await patch('3', { [field]: value });
      assert.equal(response.status, 400);
      await response.text();
    }
  }
  assert.equal(state.transactions.length, 0);
  assert.equal(state.audits.length, 0);
});

test('estado desactiva y reactiva; la autenticación rechaza inmediatamente una cuenta inactiva', async () => {
  const token = tokens.issue('2').access_token;
  for (const activo of [false, true]) {
    const response = await patch('2/estado', { activo });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.activo, activo);
    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(me.status, activo ? 200 : 401);
    await me.text();
  }
  assert.equal(state.audits.length, 2);
});

test('ambos PATCH requieren JWT y ADMIN antes de abrir la transacción', async () => {
  for (const path of ['3', '3/estado']) {
    for (const [token, expected] of [['', 401], ['invalido', 401], [tokens.issue('3').access_token, 403]]) {
      const response = await patch(path, path.endsWith('estado') ? { activo: false } : { nombres: 'Otro' }, token);
      assert.equal(response.status, expected);
      await response.text();
    }
  }
  assert.equal(state.transactions.length, 0);
});

test('IDs y campos inválidos responden 400; inexistentes 404; administración de ADMIN 403', async () => {
  for (const [path, body, expected] of [
    ['0', { nombres: 'Otro' }, 400], ['18446744073709551616', { nombres: 'Otro' }, 400],
    ['3', {}, 400], ['3', { activo: false }, 400], ['3', { password: 'no' }, 400],
    ['3', { rol: 'SUBDIRECCION' }, 400], ['3/estado', { activo: 0 }, 400],
    ['3/estado', { activo: false, cargo: 'No' }, 400],
    ['999', { nombres: 'Otro' }, 404], ['999/estado', { activo: false }, 404],
    ['1/estado', { activo: false }, 403], ['1', { rol: 'REGISTRADOR' }, 403],
  ]) {
    const response = await patch(path, body);
    assert.equal(response.status, expected);
    await response.text();
  }
  assert.equal(state.audits.length, 0);
});

test('sin cambios no hay UPDATE ni auditoría; fallos de base o auditoría revierten y devuelven 500 seguro', async () => {
  let response = await patch('3', { nombres: 'Nombre ficticio' });
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(state.audits.length, 0);
  assert.equal(state.transactions[0].some(event => event.sql?.startsWith('UPDATE')), false);
  for (const failAt of ['update', 'audit']) {
    state.failAt = failAt;
    response = await patch('3', { nombres: 'No debe persistir' });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
    assert.equal(state.users.get('3').nombres, 'Nombre ficticio');
    assert.equal(state.audits.length, 0);
    assert.equal(state.transactions.at(-1).includes('commit'), false);
  }
  state.failAt = 'duplicate';
  response = await patch('3', { usuario: 'duplicado' });
  assert.equal(response.status, 409);
  await response.text();
});
