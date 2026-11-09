import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { sectionBody, sectionsPool } from '../test-support/secciones-pool.js';

const today = '2026-11-09';
const users = new Map(['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUBDIRECCION', 'REGISTRADOR', 'OTRO'].map((rol, i) => {
  const id = String(i + 1);
  return [id, { id, rol, activo: 1, nivel_asignado: i === 1 ? 'PRIMARIA' : i === 3 ? 'SECUNDARIA' : null }];
}));
const records = ['PLANIFICADO', 'ABIERTO', 'CERRADO'].flatMap((estado, i) =>
  ['PRIMARIA', 'SECUNDARIA'].map((nivel, j) => ({
    id: String(i * 2 + j + 1), anio_escolar_id: String(i + 1), nivel, grado: 1,
    letra: 'ABC', turno: null, activo: i !== 2, estado_anio: estado, secreto: 'NO_EXPONER',
  })));
const assignments = [
  { seccion_id: '1', fecha_inicio: today, fecha_fin: today },
  { seccion_id: '4', fecha_inicio: '2026-01-01', fecha_fin: null },
  { seccion_id: '5', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' },
  { seccion_id: '2', fecha_inicio: '2026-11-10', fecha_fin: null },
  { seccion_id: '3', fecha_inicio: '2026-01-01', fecha_fin: '2026-11-08' },
];
const tokens = createTokenService(() => ({ secret: 'secreto-ficticio-secciones-http-solo-tests-123456', expiresIn: 900 }));
let server, url, state, readCalls;
beforeEach(() => { state = sectionsPool(); readCalls = 0; });
before(async () => {
  const authService = createAuthService({ tokens, repository: { findById: async id => users.get(id) } });
  function visible(filters, access) {
    readCalls++;
    if (state.readFails) throw new Error('SQL, contraseña y conexión privados');
    return records.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value)
      && (access.nivel === undefined || access.nivel === row.nivel)
      && (access.ids === undefined || access.ids.includes(row.id)));
  }
  const writes = createSeccionesRepository(() => state.pool);
  const seccionesService = createSeccionesService({ getToday: () => today,
    usuariosService: { async currentSectionIds(id, date) {
      return id === '3' ? assignments.filter(a => a.fecha_inicio <= date
        && (a.fecha_fin === null || a.fecha_fin >= date)).map(a => a.seccion_id) : [];
    } },
    repository: { create: (...args) => writes.create(...args),
      list: async ({ filters, access, offset, limit }) => visible(filters, access).slice(offset, offset + limit),
      findById: async (id, access) => visible({ id }, access)[0] ?? null },
  });
  server = createApp({ authService, seccionesService }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/secciones`;
});
after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
function request(path = '', id = '1', method = 'GET', body) {
  return fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json',
    ...(id ? { Authorization: `Bearer ${tokens.issue(id).access_token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test('ADMIN consulta listado y barra final idénticos, detalle y todos los estados del año/activo', async () => {
  const first = await request();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const body = await first.json();
  assert.equal(body.secciones.length, 6);
  assert.deepEqual(await (await request('/')).json(), body);
  for (const row of body.secciones) {
    assert.deepEqual(await (await request(`/${row.id}`)).json(), { seccion: row });
    assert.equal(typeof row.id, 'string'); assert.equal(typeof row.anio_escolar_id, 'string');
    assert.equal(typeof row.activo, 'boolean');
    assert.equal(Object.hasOwn(row, 'estado_anio'), false); assert.equal(Object.hasOwn(row, 'secreto'), false);
  }
});

test('SUBDIRECCION restringida a su nivel en listado/detalle; filtros nunca amplían acceso', async () => {
  for (const [id, nivel, own, other] of [['2', 'PRIMARIA', '1', '2'], ['4', 'SECUNDARIA', '2', '1']]) {
    const body = await (await request('', id)).json();
    assert.equal(body.secciones.length, 3);
    assert.equal(body.secciones.every(row => row.nivel === nivel), true);
    assert.equal((await request(`/${own}`, id)).status, 200);
    assert.equal((await request(`/${other}`, id)).status, 404);
    assert.equal((await request(`?nivel=${nivel === 'PRIMARIA' ? 'SECUNDARIA' : 'PRIMARIA'}`, id)).status, 403);
  }
});

test('REGISTRADOR solo asignaciones vigentes, ambos extremos inclusivos, futuras/vencidas excluidas', async () => {
  const body = await (await request('', '3')).json();
  assert.deepEqual(body.secciones.map(row => row.id), ['1', '4', '5']);
  for (const id of ['1', '4', '5']) assert.equal((await request(`/${id}`, '3')).status, 200);
  for (const id of ['2', '3', '6']) assert.equal((await request(`/${id}`, '3')).status, 404);
  assert.deepEqual((await (await request('?nivel=SECUNDARIA', '3')).json()).secciones.map(row => row.id), ['4']);
  assert.deepEqual((await (await request('', '5')).json()).secciones, []);
  assert.equal((await request('/1', '5')).status, 404);
});

test('filtros, página con fila extra, fin de lista y resultados vacíos', async () => {
  const page = await (await request('?page=2&limit=2')).json();
  assert.deepEqual(page.secciones.map(row => row.id), ['3', '4']);
  assert.deepEqual(page.pagination, { page: 2, limit: 2, has_more: true });
  assert.equal((await (await request('?page=3&limit=2')).json()).pagination.has_more, false);
  assert.deepEqual((await (await request('?anio_escolar_id=3&nivel=PRIMARIA&grado=1&activo=false')).json()).secciones.map(row => row.id), ['5']);
  assert.deepEqual((await (await request('?page=100')).json()).secciones, []);
  assert.deepEqual((await (await request('?anio_escolar_id=18446744073709551615')).json()).secciones, []);
});

test('autenticación, rol desconocido e inactivo no alcanzan consultas ni escrituras', async () => {
  for (const method of ['GET', 'POST']) {
    assert.equal((await request('', '', method, method === 'POST' ? sectionBody : undefined)).status, 401);
    assert.equal((await request('', '6', method, method === 'POST' ? sectionBody : undefined)).status, 403);
  }
  try {
    users.get('1').activo = 0;
    assert.equal((await request()).status, 401);
    assert.equal((await request('/1')).status, 401);
  } finally { users.get('1').activo = 1; }
  assert.equal(readCalls, 0); assert.equal(state.events.length, 0);
});

test('IDs/paginación/filtros inválidos 400, inexistente o fuera del ámbito 404 y error interno seguro', async () => {
  for (const path of ['/0', '/01', '/18446744073709551616', '/abc', '?page=0', '?limit=101',
    '?limit=1&limit=2', '?anio_escolar_id=1&anio_escolar_id=2', '?activo=1', '?nivel=OTRO']) {
    const response = await request(path); assert.equal(response.status, 400); await response.text();
  }
  assert.equal(readCalls, 0);
  assert.equal((await request('/18446744073709551615')).status, 404);
  state.readFails = true;
  for (const path of ['', '/1']) {
    const response = await request(path); assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
  }
});

test('POST 201 y Location con activo TRUE; SUBDIRECCION por nivel y REGISTRADOR denegado', async () => {
  let response = await request('', '1', 'POST', sectionBody);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('location'), '/api/secciones/9007199254740995');
  assert.equal((await response.json()).seccion.activo, true);
  state = sectionsPool({ actor: users.get('2') });
  response = await request('', '2', 'POST', sectionBody); assert.equal(response.status, 201); await response.text();
  response = await request('', '2', 'POST', { ...sectionBody, nivel: 'SECUNDARIA', grado: 1 });
  assert.equal(response.status, 403); await response.text();
  assert.equal((await request('', '3', 'POST', sectionBody)).status, 403);
  assert.equal((await request('', '1', 'POST', { ...sectionBody, activo: false })).status, 400);
});

test('POST errores HTTP de año, UNIQUE y auditoría seguros; PATCH/DELETE no implementados', async () => {
  for (const [options, status] of [[{ year: null }, 404], [{ year: { estado: 'CERRADO' } }, 409],
    [{ failAt: 'audit' }, 500]]) {
    state = sectionsPool(options);
    const response = await request('', '1', 'POST', sectionBody); assert.equal(response.status, status);
    if (status === 500) assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
    else await response.text();
  }
  state = sectionsPool();
  const first = await request('', '1', 'POST', sectionBody); await first.text();
  const duplicate = await request('', '1', 'POST', sectionBody); assert.equal(duplicate.status, 409); await duplicate.text();
  for (const method of ['PATCH', 'DELETE']) assert.equal((await request('/1', '1', method)).status, 404);
});
