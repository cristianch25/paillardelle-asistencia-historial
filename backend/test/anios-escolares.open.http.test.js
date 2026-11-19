import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { openingFixture } from '../test-support/anios-open-pool.js';

let fixture, server, url;
const tokens = createTokenService(() => ({ secret: 'secreto-ficticio-apertura-http-solo-tests-123456', expiresIn: 900 }));
beforeEach(() => {
  fixture = openingFixture();
  fixture.state.users.set('3', { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' });
  fixture.state.additional.set('3', ['SECUNDARIA', 'INICIAL']);
  fixture.state.users.set('4', { id: '4', rol: 'REGISTRADOR', activo: 1 });
  fixture.state.users.set('5', { id: '5', rol: 'PORTERIA', activo: 1 });
});
before(async () => {
  const authService = createAuthService({ tokens, repository: { findById: async id => fixture.state.users.get(id) } });
  const aniosEscolaresService = { open: (...args) => fixture.service.open(...args), findById: (...args) => fixture.service.findById(...args) };
  server = createApp({ authService, aniosEscolaresService }).listen(0, '127.0.0.1');
  await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}/api/anios-escolares`;
});
after(async () => { if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
function request(path = '/1/abrir', { id = '1', method = 'PATCH', body, raw } = {}) {
  return fetch(url + path, { method, headers: { 'Content-Type': 'application/json',
    ...(id ? { Authorization: `Bearer ${tokens.issue(id).access_token}` } : {}) },
  ...(raw === undefined && body === undefined ? {} : { body: raw ?? JSON.stringify(body) }) });
}

test('apertura HTTP: 200, cuerpo opcional/vacío, estado y campos públicos con BIGINT unsigned exacto', async () => {
  for (const body of [undefined, {}]) {
    fixture = openingFixture(); fixture.state.year.id = '18446744073709551615';
    const response = await request('/18446744073709551615/abrir', { body });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const year = (await response.json()).anio_escolar;
    assert.equal(year.id, '18446744073709551615'); assert.equal(year.estado, 'ABIERTO');
    assert.deepEqual(Object.keys(year).sort(), ['anio', 'created_at', 'estado', 'fecha_fin', 'fecha_inicio', 'id', 'updated_at']);
    const get = await request('/18446744073709551615', { method: 'GET' });
    assert.equal(get.status, 200); assert.deepEqual((await get.json()).anio_escolar, year);
  }
});

test('apertura HTTP: 401 sin JWT/inactivo y 403 para SUBDIRECCION de tres niveles, REGISTRADOR y rol futuro', async () => {
  for (const [id, status] of [['', 401], ['3', 403], ['4', 403], ['5', 403]]) {
    const response = await request(undefined, { id, raw: '{' }); assert.equal(response.status, status); await response.text();
  }
  fixture.state.users.get('1').activo = 0;
  const response = await request(); assert.equal(response.status, 401); await response.text();
  assert.equal(fixture.state.transactions.length, 0);
});

test('apertura HTTP: inexistente 404, ya ABIERTO/CERRADO 409 y ninguna auditoría redundante', async () => {
  let response = await request('/999/abrir'); assert.equal(response.status, 404); await response.text();
  for (const estado of ['ABIERTO', 'CERRADO']) {
    fixture.state.year.estado = estado;
    response = await request(); assert.equal(response.status, 409); await response.text();
  }
  assert.equal(fixture.state.audits.length, 0);
});

test('apertura HTTP: 400 por ID/campos/JSON y 413 por cuerpo excesivo; no hay reapertura', async () => {
  for (const path of ['/0/abrir', '/01/abrir', '/18446744073709551616/abrir']) {
    const response = await request(path); assert.equal(response.status, 400); await response.text();
  }
  for (const [raw, status] of [['{', 400], ['null', 400], ['[]', 400],
    [JSON.stringify({ estado: 'ABIERTO' }), 400], [JSON.stringify({ motivo: 'a'.repeat(9000) }), 413]]) {
    const response = await request(undefined, { raw }); assert.equal(response.status, status); await response.text();
  }
  assert.equal(fixture.state.transactions.length, 0);
  for (const path of ['/1/reabrir']) {
    const response = await request(path); assert.equal(response.status, 404); await response.text();
  }
});

test('apertura HTTP: dos ADMIN concurrentes reciben 200/409 con una única auditoría', async () => {
  const responses = await Promise.all([request(), request(undefined, { id: '2' })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  await Promise.all(responses.map(response => response.text()));
  assert.equal(fixture.state.audits.length, 1); assert.equal(fixture.state.year.estado, 'ABIERTO');
});

test('apertura HTTP: fallo de auditoría revierte la transición y devuelve error genérico seguro', async () => {
  fixture.state.failAt = 'audit';
  const response = await request(); assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
  assert.equal(fixture.state.year.estado, 'PLANIFICADO'); assert.equal(fixture.state.audits.length, 0);
});
