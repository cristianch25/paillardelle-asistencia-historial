import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAttendanceService } from '../src/modules/asistencias/service.js';
import { superuserFixture } from '../test-support/superusuario-fixture.js';

async function fixture(t) {
  const f = await superuserFixture();
  // Asistencia revalida el rol dentro de la lectura; solo se simula su repositorio.
  const listRepository = { read: (id, work) => work(null, f.state.users.get(id)) };
  const attendanceService = createAttendanceService({ listRepository });
  const server = createApp({ ...f, attendanceService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(actor, method, path, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { Authorization: `Bearer ${f.tokens.issue(actor).access_token}`,
        'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { ...f, request };
}

test('V8: consultas por rol, ID, estado y paginación sin filtrar después de LIMIT', async t => {
  const { request } = await fixture(t);
  for (const [actor, ids] of [['1', ['1', '2', '3', '4']], ['9', ['1', '2']]]) {
    const response = await request(actor, 'GET', '/usuarios');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.users.map(user => user.id), ids);
    for (const id of ['1', '2', '3', '4', '9']) {
      assert.equal((await request(actor, 'GET', `/usuarios/${id}`)).status, ids.includes(id) ? 200 : 403);
    }
  }
  const first = await request('9', 'GET', '/usuarios?limit=1');
  assert.deepEqual(first.body.users.map(user => user.id), ['1']);
  assert.equal(first.body.pagination.has_more, true);
  const last = await request('9', 'GET', '/usuarios?limit=1&page=2');
  assert.deepEqual(last.body.users.map(user => user.id), ['2']);
  assert.equal(last.body.pagination.has_more, false);
  assert.equal(first.headers.get('cache-control'), 'no-store');
});

test('V8: matriz HTTP de cuatro roles en PATCH, estado, contraseña y niveles', async t => {
  const { state, request } = await fixture(t);
  for (const actor of ['1', '3', '4', '9']) for (const target of ['1', '2', '3', '4', '9']) {
    const admin = actor === '1' && ['3', '4'].includes(target);
    const technical = actor === '9' && ['1', '2'].includes(target);
    for (const [method, suffix, body, expected] of [
      ['PATCH', '', { nombres: 'Nombre ficticio' }, admin ? 200 : 403],
      ['PATCH', '/estado', { activo: true }, admin || technical ? 200 : 403],
      ['POST', '/restablecer-contrasena', {}, admin || technical ? 200 : 403],
      ['GET', '/niveles-adicionales', undefined, admin ? (target === '3' ? 200 : 409) : 403],
      ['PUT', '/niveles-adicionales', { niveles_adicionales: [] }, admin ? (target === '3' ? 200 : 409) : 403],
    ]) {
      const before = state.audits.length;
      const response = await request(actor, method, `/usuarios/${target}${suffix}`, body);
      assert.equal(response.status, expected, `${actor}: ${method} ${target}${suffix}`);
      if (expected === 403) assert.equal(state.audits.length, before);
    }
  }
  for (const actor of ['3', '4']) for (const path of ['/usuarios', '/usuarios/1']) {
    assert.equal((await request(actor, 'GET', path)).status, 403);
  }
  for (const actor of ['1', '9']) for (const target of ['3', '4']) {
    assert.equal((await request(actor, 'PATCH', `/usuarios/${target}`, { rol: 'ADMIN' })).status, 403);
    assert.equal((await request(actor, 'PATCH', `/usuarios/${target}`, { rol: 'SUPERUSUARIO' })).status, actor === '1' ? 403 : 400);
  }
  assert.equal((await request('9', 'PATCH', '/usuarios/1/estado', { activo: false, rol: 'ADMIN' })).status, 400);
  assert.equal((await request('9', 'PATCH', '/usuarios/1', { rol: 'ADMIN' })).status, 403);
  assert.equal((await request('9', 'POST', '/usuarios/1/restablecer-contrasena', { password: 'Elegida' })).status, 400);
});

test('V8: matriz POST bloquea promociones y creación de SUPERUSUARIO por API', async t => {
  const { request, repository, state } = await fixture(t);
  let inserts = 0;
  repository.create = async (data, actorId, authorize) => {
    authorize(state.users.get(actorId));
    inserts++;
    return { id: '10', ...data, activo: 1 };
  };
  for (const actor of ['1', '3', '4', '9']) for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) {
    const allowed = actor === '9' ? rol === 'ADMIN' : actor === '1' && ['SUBDIRECCION', 'REGISTRADOR'].includes(rol);
    const before = inserts;
    const response = await request(actor, 'POST', '/usuarios', { nombres: 'Cuenta', apellidos: 'Ficticia',
      usuario: 'nueva', password: 'Ficticia123', rol, nivel_asignado: 'PRIMARIA' });
    const expected = ['3', '4'].includes(actor) ? 403 : rol === 'SUPERUSUARIO' ? 400 : allowed ? 201 : 403;
    assert.equal(response.status, expected, `${actor} crea ${rol}`);
    assert.equal(inserts - before, allowed ? 1 : 0);
    if (allowed) assert.equal(Object.hasOwn(response.body.user, 'password_hash'), false);
  }
});

test('SUPERUSUARIO inicia sesión, consulta perfil y cambia contraseña propia sin revocar JWT', async t => {
  const { request, authService, tokens, state } = await fixture(t);
  const login = await authService.login({ usuario: 'cuenta9', password: 'ClaveFicticiaInicial' });
  assert.equal(login.user.rol, 'SUPERUSUARIO');
  const previous = tokens.issue('9').access_token;
  assert.equal((await request('9', 'GET', '/auth/me')).body.user.rol, 'SUPERUSUARIO');
  assert.equal((await request('9', 'POST', '/auth/cambiar-contrasena', {
    password_actual: 'ClaveFicticiaInicial', password_nueva: 'NuevaFicticia123', password_confirmacion: 'NuevaFicticia123',
  })).status, 200);
  assert.equal((await authService.authenticate(previous)).rol, 'SUPERUSUARIO');
  assert.equal(state.audits[0][1], 'CAMBIAR_PASSWORD');
  await assert.rejects(authService.login({ usuario: 'cuenta9', password: 'ClaveFicticiaInicial' }), { status: 401 });
  assert.equal((await authService.login({ usuario: 'cuenta9', password: 'NuevaFicticia123' })).user.rol, 'SUPERUSUARIO');
});

test('SUPERUSUARIO sin acceso académico ni auditoría global; JWT previo usa permisos actuales', async t => {
  const { request, state } = await fixture(t);
  for (const path of ['/anios-escolares', '/secciones', '/asignaciones', '/estudiantes', '/matriculas',
    '/asistencias/sesiones?anio_escolar_id=1&fecha=2026-11-20',
    '/asistencias/estadisticas?anio_escolar_id=1&mes=2026-11',
    '/importaciones', '/auditoria', '/reportes/asistencia-mensual.pdf?seccion_id=1&mes=2026-11']) {
    assert.equal((await request('9', 'GET', path)).status, 403, path);
  }
  state.users.get('9').rol = 'REGISTRADOR';
  assert.equal((await request('9', 'GET', '/usuarios')).status, 403);
  state.users.get('9').activo = 0;
  assert.equal((await request('9', 'GET', '/auth/me')).status, 401);
});
