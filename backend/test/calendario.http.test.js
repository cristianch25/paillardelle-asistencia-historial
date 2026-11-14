import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { calendarFixture, periodBody, scope, today } from '../test-support/calendario-fixture.js';

let server, url, fixture;
const tokens = createTokenService(() => ({ secret: 'secreto-ficticio-calendario-http-solo-tests-123456', expiresIn: 900 }));
beforeEach(() => {
  fixture = calendarFixture();
  fixture.state.users.set('3', { id: '3', activo: 1, rol: 'SUBDIRECCION', nivel_asignado: 'INICIAL' });
  fixture.state.users.set('4', { id: '4', activo: 1, rol: 'REGISTRADOR', nivel_asignado: 'SECUNDARIA' });
  fixture.state.users.set('5', { id: '5', activo: 1, rol: 'PORTERIA' });
  fixture.state.users.set('6', { id: '6', activo: 0, rol: 'ADMIN' });
  fixture.state.assignments = [{ usuario_id: '4', seccion_id: '10', fecha_inicio: today, fecha_fin: today }];
});
before(async () => {
  const authService = createAuthService({ tokens, repository: { findById: async id => fixture.state.users.get(id) } });
  const calendarService = new Proxy({}, { get: (_target, key) => (...args) => fixture.service[key](...args) });
  server = createApp({ authService, calendarService }).listen(0, '127.0.0.1');
  await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { if (server?.listening) await new Promise((resolve, reject) =>
  server.close(error => error ? reject(error) : resolve())); });
function request(path, { id = '1', method = 'GET', body, raw } = {}) {
  return fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json',
    ...(id ? { Authorization: `Bearer ${tokens.issue(id).access_token}` } : {}) },
  ...(raw === undefined && body === undefined ? {} : { body: raw ?? JSON.stringify(body) }) });
}
const query = 'anio_escolar_id=1&nivel=PRIMARIA';
const exceptionPath = '/calendario-lectivo/excepciones/1/PRIMARIA/2026-03-07';

test('HTTP calendario: ocho endpoints, contratos, Location, IDs de texto y Cache-Control', async () => {
  let response = await request('/periodos-lectivos', { method: 'POST', body: periodBody });
  assert.equal(response.status, 201); const row = (await response.json()).periodo_lectivo;
  assert.equal(response.headers.get('location'), `/api/periodos-lectivos/${row.id}`);
  assert.equal(typeof row.id, 'string'); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await (await request(`/periodos-lectivos/${row.id}`)).json()).periodo_lectivo.id, row.id);
  for (const path of [`/periodos-lectivos?${query}`, `/periodos-lectivos/?${query}`]) {
    const body = await (await request(path)).json(); assert.equal(body.periodos_lectivos.length, 1);
    assert.deepEqual(body.pagination, { page: 1, limit: 20, has_more: false });
  }
  response = await request(`/periodos-lectivos/${row.id}`, { method: 'PATCH', body: { fecha_fin: '2026-12-17' } });
  assert.equal(response.status, 200); assert.equal((await response.json()).periodo_lectivo.fecha_fin, '2026-12-17');
  response = await request(exceptionPath, { method: 'PUT', body: { es_lectivo: true, descripcion: 'Recuperación' } });
  assert.equal(response.status, 200); assert.equal((await response.json()).excepcion.es_lectivo, true);
  response = await request(`/calendario-lectivo/excepciones?${query}`);
  assert.equal((await response.json()).excepciones.length, 1);
  response = await request('/calendario-lectivo/excepciones/rango', { method: 'POST',
    body: { ...scope, fecha_inicio: '2026-03-03', fecha_fin: '2026-03-04', descripcion: 'Suspensión' } });
  assert.equal(response.status, 200); assert.equal((await response.json()).excepciones.length, 2);
  response = await request(`/calendario-lectivo?${query}&desde=2026-03-02&hasta=2026-03-08`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).dias.map(day => day.es_lectivo), [true, false, false, true, true, true, false]);
});

test('HTTP calendario: autenticación, rol futuro y usuario inactivo sin consultas ni escrituras', async () => {
  for (const path of [`/periodos-lectivos?${query}`, `/calendario-lectivo/excepciones?${query}`]) {
    for (const [id, status] of [['', 401], ['5', 403], ['6', 401], ['7', 401]]) {
      const response = await request(path, { id }); assert.equal(response.status, status); await response.text();
    }
  }
  assert.equal(fixture.state.transactions.length, 0); assert.equal(fixture.state.calls.length, 0);
});

test('HTTP calendario: supervisión por nivel adicional y REGISTRADOR solo consulta nivel asignado vigente', async () => {
  await request('/periodos-lectivos', { method: 'POST', body: periodBody });
  let response = await request(`/periodos-lectivos?${query}`, { id: '3' });
  assert.equal(response.status, 403); await response.text();
  fixture.state.additional.set('3', ['PRIMARIA']);
  response = await request(`/periodos-lectivos?${query}`, { id: '3' }); assert.equal(response.status, 200); await response.text();
  response = await request(`/periodos-lectivos?${query}`, { id: '4' }); assert.equal(response.status, 200); await response.text();
  response = await request(`/calendario-lectivo?${query}&desde=2026-03-02&hasta=2026-03-02`, { id: '4' });
  assert.equal(response.status, 200); await response.text();
  response = await request('/periodos-lectivos?anio_escolar_id=1&nivel=SECUNDARIA', { id: '4' });
  assert.equal(response.status, 403); await response.text();
  for (const [path, method] of [['/periodos-lectivos', 'POST'], ['/periodos-lectivos/1', 'PATCH'],
    [exceptionPath, 'PUT'], ['/calendario-lectivo/excepciones/rango', 'POST']]) {
    response = await request(path, { id: '4', method, raw: '{' }); assert.equal(response.status, 403); await response.text();
  }
});

test('HTTP calendario: validaciones estrictas, JSON y límite de cuerpo, 404 y 409', async () => {
  for (const path of ['/periodos-lectivos/01', '/periodos-lectivos/18446744073709551616',
    `/periodos-lectivos?${query}&nivel=INICIAL`, `/periodos-lectivos?${query}&page=1&page=2`,
    `/periodos-lectivos?${query}&extra=1`, '/periodos-lectivos',
    `/calendario-lectivo?${query}`, `/calendario-lectivo/excepciones?${query}&desde=2026-03-02`]) {
    const response = await request(path); assert.equal(response.status, 400, path); await response.text();
  }
  for (const [raw, status] of [['{', 400], [JSON.stringify({ extra: 'a'.repeat(9000) }), 413]]) {
    const response = await request('/periodos-lectivos', { method: 'POST', raw });
    assert.equal(response.status, status); await response.text();
  }
  assert.equal((await request('/periodos-lectivos/999')).status, 404);
  let response = await request('/periodos-lectivos', { method: 'POST', body: periodBody }); await response.text();
  response = await request('/periodos-lectivos', { method: 'POST', body: periodBody });
  assert.equal(response.status, 409); await response.text();
  for (const path of ['/periodos-lectivos/1', exceptionPath]) {
    response = await request(path, { method: 'DELETE' }); assert.equal(response.status, 404); await response.text();
  }
});

test('HTTP calendario: fallos internos devuelven error seguro y revierten escritura', async () => {
  fixture.state.failAt = 'audit';
  let response = await request('/periodos-lectivos', { method: 'POST', body: periodBody });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
  assert.equal(fixture.state.periods.length, 0); assert.equal(fixture.state.audits.length, 0);
  fixture.state.readFails = true;
  response = await request('/periodos-lectivos/1'); assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
});

test('HTTP calendario BIGINT: IDs y Location exactos por encima de 2^53 y en 2^63', async () => {
  for (const nextId of [9007199254740993n, 9223372036854775808n]) {
    fixture = calendarFixture({ nextId, forbidInsertId: true });
    const id = String(nextId);
    let response = await request('/periodos-lectivos', { method: 'POST', body: periodBody });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('location'), `/api/periodos-lectivos/${id}`);
    assert.equal((await response.json()).periodo_lectivo.id, id);
    response = await request(`/periodos-lectivos/${id}`);
    assert.equal(response.status, 200); assert.equal((await response.json()).periodo_lectivo.id, id);
    response = await request(`/periodos-lectivos/${id}`, { method: 'PATCH', body: { fecha_fin: '2026-12-17' } });
    assert.equal(response.status, 200); assert.equal((await response.json()).periodo_lectivo.id, id);
    response = await request(`/periodos-lectivos?${query}`);
    assert.equal((await response.json()).periodos_lectivos[0].id, id);
    response = await request(exceptionPath, { method: 'PUT', body: { es_lectivo: true, descripcion: 'Recuperación' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).excepcion.id, String(nextId + 1n));
    response = await request(`/calendario-lectivo/excepciones?${query}`);
    assert.equal((await response.json()).excepciones[0].id, String(nextId + 1n));
  }
});
