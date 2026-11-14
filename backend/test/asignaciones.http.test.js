import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { assignmentFixture, assignmentBody, today } from '../test-support/asignaciones-pool.js';

let fixture, server, url;
const tokens = createTokenService(() => ({ secret: 'secreto-ficticio-asignaciones-http-solo-tests-123456', expiresIn: 900 }));
beforeEach(() => {
  fixture = assignmentFixture();
  const rows = [['101', '3', '10', today, today], ['102', '5', '11', '2026-01-01', null],
    ['103', '3', '12', '2026-11-14', null], ['104', '3', '10', '2026-01-01', '2026-11-12']];
  fixture.state.assignments.push(...rows.map(([id, usuario_id, seccion_id, fecha_inicio, fecha_fin]) =>
    ({ id, usuario_id, seccion_id, fecha_inicio, fecha_fin, nivel: fixture.state.sections.get(seccion_id).nivel,
      created_at: '2026-01-01 00:00:00', secreto: 'NO_EXPONER' })));
});
before(async () => {
  const authService = createAuthService({ tokens, repository: { findById: async id => fixture.state.users.get(id) } });
  const assignmentsService = { list: (...args) => fixture.service.list(...args), create: (...args) => fixture.service.create(...args) };
  server = createApp({ authService, assignmentsService }).listen(0, '127.0.0.1');
  await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}/api/asignaciones`;
});
after(async () => { if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
function request(path = '', id = '1', method = 'GET', body, raw) {
  return fetch(url + path, { method, headers: { 'Content-Type': 'application/json',
    ...(id ? { Authorization: `Bearer ${tokens.issue(id).access_token}` } : {}) },
  ...(body === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(body) }) });
}

test('asignaciones HTTP: listado y barra final, campos públicos, orden y paginación', async () => {
  const response = await request(); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.deepEqual(body.asignaciones.map(row => row.id), ['101', '102', '103', '104']);
  assert.equal(Object.hasOwn(body.asignaciones[0], 'secreto'), false); assert.equal(Object.hasOwn(body.asignaciones[0], 'nivel'), false);
  assert.deepEqual(await (await request('/')).json(), body);
  const page = await (await request('?page=2&limit=2')).json();
  assert.deepEqual(page.asignaciones.map(row => row.id), ['103', '104']); assert.equal(page.pagination.has_more, false);
  assert.equal((await (await request('?limit=2')).json()).pagination.has_more, true);
  assert.deepEqual((await (await request('?page=50')).json()).asignaciones, []);
});

test('asignaciones HTTP: SUBDIRECCION principal/adicional y REGISTRADOR solo propias, sin ampliar por filtros', async () => {
  assert.deepEqual((await (await request('', '4')).json()).asignaciones.map(row => row.id), ['101', '104']);
  fixture.state.additional.set('4', ['INICIAL']);
  assert.deepEqual((await (await request('', '4')).json()).asignaciones.map(row => row.id), ['101', '103', '104']);
  const denied = await request('?nivel=SECUNDARIA', '4'); assert.equal(denied.status, 403); await denied.text();
  assert.deepEqual((await (await request('', '3')).json()).asignaciones.map(row => row.id), ['101', '103', '104']);
  assert.deepEqual((await (await request('?usuario_id=5', '3')).json()).asignaciones, []);
  assert.deepEqual((await (await request('?nivel=SECUNDARIA', '3')).json()).asignaciones, []);
  const call = fixture.state.calls.at(-1);
  assert.match(call.sql, /s.nivel = \? AND a.usuario_id = \?.*LIMIT \? OFFSET \?$/);
  assert.deepEqual(call.params, ['SECUNDARIA', '3', 21, 0]);
});

test('asignaciones HTTP: vigencias inclusivas en Lima, filtros usuario/sección/año/nivel y año cerrado consultable', async () => {
  for (const [vigencia, ids] of [['VIGENTE', ['101', '102']], ['FUTURA', ['103']], ['FINALIZADA', ['104']]]) {
    const body = await (await request(`?vigencia=${vigencia}`)).json();
    assert.deepEqual(body.asignaciones.map(row => row.id), ids);
  }
  fixture.state.year.estado = 'CERRADO';
  const response = await request('?usuario_id=3&seccion_id=10&anio_escolar_id=20&nivel=PRIMARIA&vigencia=VIGENTE');
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).asignaciones.map(row => row.id), ['101']);
  assert.deepEqual((await (await request('?anio_escolar_id=999')).json()).asignaciones, []);
});

test('asignaciones HTTP: autenticación/rol/inactivo y POST reservado antes de parsear JSON', async () => {
  for (const [id, status] of [['', 401], ['6', 403]]) {
    const response = await request('', id); assert.equal(response.status, status); await response.text();
  }
  fixture.state.users.get('3').activo = 0;
  assert.equal((await request('', '3')).status, 401);
  for (const id of ['3', '4', '6']) {
    const response = await request('', id, 'POST', undefined, '{');
    assert.equal(response.status, id === '3' ? 401 : 403); await response.text();
  }
  assert.equal(fixture.state.transactions.length, 0); assert.equal(fixture.state.calls.length, 0);
});

test('asignaciones HTTP: POST 201, validaciones estrictas, conflicto 409 y errores internos seguros', async () => {
  fixture.state.assignments.length = 0;
  let response = await request('', '1', 'POST', assignmentBody);
  assert.equal(response.status, 201); const row = (await response.json()).asignacion;
  assert.equal(row.id, '9007199254740993'); assert.equal(row.usuario_id, '3');
  response = await request('', '1', 'POST', assignmentBody); assert.equal(response.status, 409); await response.text();
  for (const path of ['?page=0', '?limit=101', '?usuario_id=3&usuario_id=5', '?nivel=PRIMARIA&nivel=INICIAL', '?vigencia=OTRA', '?extra=1']) {
    response = await request(path); assert.equal(response.status, 400); await response.text();
  }
  for (const [raw, status] of [['{', 400], [JSON.stringify({ extra: 'a'.repeat(9000) }), 413]]) {
    response = await request('', '1', 'POST', undefined, raw); assert.equal(response.status, status); await response.text();
  }
  fixture.state.failAt = 'audit';
  response = await request('', '1', 'POST', { ...assignmentBody, seccion_id: '11' }); assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
  assert.equal(fixture.state.assignments.length, 1); assert.equal(fixture.state.audits.length, 1);
  fixture.state.readFails = true;
  response = await request(); assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
});

test('asignaciones HTTP: no hay detalle, edición ni borrado en este bloque', async () => {
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    const response = await request('/101', '1', method); assert.equal(response.status, 404); await response.text();
  }
});
