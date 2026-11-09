import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createUsuariosService } from '../src/modules/usuarios/usuarios.service.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createSupervisionService } from '../src/modules/usuarios/usuarios.supervision.service.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { testUser, updatePool } from '../test-support/usuarios-update-pool.js';
import { sectionsPool, sectionBody } from '../test-support/secciones-pool.js';

const tokens = createTokenService(() => ({ secret: 'secreto-ficticio-multinivel-http-solo-pruebas-12345678', expiresIn: 900 }));
const records = ['INICIAL', 'INICIAL', 'PRIMARIA', 'SECUNDARIA', 'SECUNDARIA'].map((nivel, i) => ({
  id: String(i + 1), anio_escolar_id: '1', nivel, grado: nivel === 'INICIAL' ? i + 4 : i === 4 ? 5 : 1,
  letra: i === 0 ? 'CREATIVOS' : i === 1 ? 'GENIALES' : 'A', activo: true, turno: null,
}));
let state, sectionState, server, base;
beforeEach(() => {
  state = updatePool([testUser('1'), testUser('2', 'SUBDIRECCION', { nivel_asignado: 'PRIMARIA' }),
    testUser('3', 'SUBDIRECCION', { nivel_asignado: 'SECUNDARIA' }),
    testUser('4', 'SUBDIRECCION', { nivel_asignado: 'SECUNDARIA' }),
    testUser('5', 'REGISTRADOR', { nivel_asignado: 'INICIAL' }),
    testUser('6', 'REGISTRADOR', { nivel_asignado: 'INICIAL' })]);
  sectionState = sectionsPool();
});
before(async () => {
  const supervision = createSupervisionService({ repository: createSupervisionRepository(() => state.pool) });
  const usuariosService = createUsuariosService({ repository: createUsuariosRepository(() => state.pool), supervision });
  const authService = createAuthService({ tokens, repository: { findById: async id => state.users.get(id) } });
  const writes = createSeccionesRepository(() => sectionState.pool);
  const visible = (filters, access) => records.filter(row =>
    Object.entries(filters).every(([key, value]) => row[key] === value)
    && (access.levels === undefined || access.levels.includes(row.nivel))
    && (access.ids === undefined || access.ids.includes(row.id)));
  const seccionesService = createSeccionesService({ usuariosService: { ...usuariosService,
    currentSectionIds: async id => id === '5' ? ['1'] : id === '6' ? ['2'] : [] }, repository: {
    list: async ({ filters, access, limit, offset }) => visible(filters, access).slice(offset, offset + limit),
    findById: async (id, access) => visible({ id }, access)[0] ?? null,
    create: (...args) => writes.create(...args),
  } });
  server = createApp({ authService, usuariosService, seccionesService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
function request(path, id = '1', method = 'GET', body, token) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(id ? { Authorization: `Bearer ${token ?? tokens.issue(id).access_token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const permissions = '/usuarios/2/niveles-adicionales';

test('ADMIN consulta/concede/revoca niveles; mismo JWT de SUBDIRECCION refleja cambios inmediatamente', async () => {
  const token = tokens.issue('2').access_token;
  let response = await request(permissions);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).niveles_efectivos, ['PRIMARIA']);
  assert.equal((await request('/secciones?nivel=INICIAL', '2', 'GET', undefined, token)).status, 403);
  response = await request(permissions, '1', 'PUT', { niveles_adicionales: ['INICIAL'] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).niveles_efectivos, ['PRIMARIA', 'INICIAL']);
  response = await request('/secciones', '2', 'GET', undefined, token);
  assert.deepEqual((await response.json()).secciones.map(row => row.id), ['1', '2', '3']);
  assert.equal((await request('/secciones/1', '2')).status, 200);
  assert.equal((await request('/secciones/4', '2')).status, 404);
  assert.equal((await request('/secciones?nivel=SECUNDARIA', '2')).status, 403);
  response = await request(permissions, '1', 'PUT', { niveles_adicionales: [] }); await response.json();
  assert.equal((await request('/secciones/1', '2', 'GET', undefined, token)).status, 404);
  assert.equal((await request('/secciones?nivel=INICIAL', '2', 'GET', undefined, token)).status, 403);
});

test('ambos subdirectores de SECUNDARIA acceden a todo el nivel, no a INICIAL; profesoras solo su salón', async () => {
  for (const id of ['3', '4']) {
    const response = await request('/secciones', id);
    assert.deepEqual((await response.json()).secciones.map(row => row.id), ['4', '5']);
    for (const section of ['4', '5']) assert.equal((await request('/secciones/' + section, id)).status, 200);
    assert.equal((await request('/secciones/1', id)).status, 404);
  }
  for (const [id, own, other] of [['5', '1', '2'], ['6', '2', '1']]) {
    state.additional.set(id, ['PRIMARIA', 'SECUNDARIA']);
    const response = await request('/secciones', id);
    assert.deepEqual((await response.json()).secciones.map(row => row.id), [own]);
    assert.equal((await request('/secciones/' + other, id)).status, 404);
    assert.equal((await request('/secciones', id, 'POST', sectionBody)).status, 403);
  }
});

test('administración adicional es exclusiva de ADMIN: 401/403 antes de transacciones', async () => {
  for (const method of ['GET', 'PUT']) for (const [id, status] of [['', 401], ['2', 403], ['5', 403]]) {
    const response = await request(permissions, id, method, method === 'PUT' ? { niveles_adicionales: [] } : undefined);
    assert.equal(response.status, status); await response.text();
  }
  assert.equal(state.transactions.length, 0);
});

test('API valida listas/IDs, principal redundante, destino y errores seguros', async () => {
  for (const [path, body, status] of [[permissions, { niveles_adicionales: ['INICIAL', 'INICIAL'] }, 400],
    [permissions, { niveles_adicionales: ['OTRO'] }, 400], [permissions, { niveles_adicionales: ['PRIMARIA'] }, 409],
    ['/usuarios/5/niveles-adicionales', { niveles_adicionales: [] }, 409],
    ['/usuarios/999/niveles-adicionales', { niveles_adicionales: [] }, 404],
    ['/usuarios/18446744073709551616/niveles-adicionales', { niveles_adicionales: [] }, 400]]) {
    const response = await request(path, '1', 'PUT', body); assert.equal(response.status, status); await response.text();
  }
  state.failAt = 'audit';
  const response = await request(permissions, '1', 'PUT', { niveles_adicionales: ['INICIAL'] });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
  assert.equal(state.additional.has('2'), false);
});

test('perfil INICIAL y creación de secciones conservan representación/Location; config no se acepta en PATCH ordinario', async () => {
  const profile = await request('/auth/me', '5');
  assert.equal((await profile.json()).user.nivel_asignado, 'INICIAL');
  const denied = await request('/usuarios/2', '1', 'PATCH', { niveles_adicionales: ['INICIAL'] });
  assert.equal(denied.status, 400); await denied.text();
  await (await request(permissions, '1', 'PUT', { niveles_adicionales: ['INICIAL'] })).json();
  sectionState.actor = state.users.get('2'); sectionState.additionalLevels = state.additional.get('2');
  const created = await request('/secciones', '2', 'POST', { ...sectionBody, nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), '/api/secciones/9007199254740995');
  assert.equal((await created.json()).seccion.letra, 'CREATIVOS');
});

test('desactivación invalida JWT y cambio de rol retira permisos sin alterar contratos de usuarios', async () => {
  await (await request(permissions, '1', 'PUT', { niveles_adicionales: ['INICIAL'] })).json();
  const token = tokens.issue('2').access_token;
  const disabled = await request('/usuarios/2/estado', '1', 'PATCH', { activo: false });
  assert.equal(disabled.status, 200); await disabled.json();
  assert.equal((await request('/secciones', '2', 'GET', undefined, token)).status, 401);
  await (await request('/usuarios/2/estado', '1', 'PATCH', { activo: true })).json();
  const changed = await request('/usuarios/2', '1', 'PATCH', { rol: 'REGISTRADOR' });
  assert.equal(changed.status, 200); await changed.json();
  assert.equal(state.additional.has('2'), false);
  assert.deepEqual((await (await request('/secciones', '2', 'GET', undefined, token)).json()).secciones, []);
});
