import assert from 'node:assert/strict';
import { once } from 'node:events';
import { afterEach, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

let f, server, url;
const tokens = createTokenService(() => ({ secret: 'secreto-ficticio-estudiantes-tests-123456789', expiresIn: 900 }));
beforeEach(async () => {
  f = studentsFixture();
  const authService = createAuthService({ repository: { findById: async id => f.state.users.get(id) }, tokens });
  server = createApp({ authService, usuariosService: f.users, seccionesService: f.sections,
    studentsService: f.students, matriculasService: f.matriculas }).listen(0, '127.0.0.1');
  await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}/api`;
});
afterEach(async () => { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
function request(path, { id = '1', method = 'GET', body, raw } = {}) {
  return fetch(url + path, { method, headers: { 'Content-Type': 'application/json',
    ...(id ? { Authorization: `Bearer ${tokens.issue(id).access_token}` } : {}) },
  ...(body === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(body) }) });
}
test('HTTP alta conjunta y padrón funcionan con el perfil público real de autenticación', async () => {
  let response = await request('/matriculas/alta-inicial', { id: '2', method: 'POST', body: { ...enrollment, estudiante: identity } });
  assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.equal(result.matricula.estudiante_id, result.estudiante.id);
  response = await request('/secciones/11/padron?fecha=2026-03-01', { id: '2' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).padron[0].estudiante.id, result.estudiante.id);
  for (const path of ['/estudiantes', '/matriculas']) {
    response = await request(path, { id: '2' }); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store'); await response.json();
  }
});
test('HTTP identidad individual y matrícula existente no duplican el alta conjunta', async () => {
  let response = await request('/estudiantes', { method: 'POST', body: identity });
  assert.equal(response.status, 201); const { estudiante } = await response.json();
  response = await request('/matriculas', { method: 'POST', body: { ...enrollment, estudiante_id: estudiante.id } });
  assert.equal(response.status, 201); await response.json();
  response = await request('/matriculas', { method: 'POST', body: { ...enrollment, estudiante_id: estudiante.id } });
  assert.equal(response.status, 409); await response.json();
  assert.equal(f.state.students.length, 1); assert.equal(f.state.links.length, 1);
});
test('HTTP sin JWT o cuenta desactivada: 401; rol/ámbito ajeno: 403 antes de parsear JSON', async () => {
  for (const path of ['/estudiantes', '/matriculas', '/secciones/11/padron?fecha=2026-03-01']) {
    const response = await request(path, { id: '' }); assert.equal(response.status, 401); await response.text();
  }
  for (const [path, id] of [['/estudiantes', '2'], ['/estudiantes', '4'], ['/matriculas', '4'], ['/matriculas/alta-inicial', '4']]) {
    const response = await request(path, { id, method: 'POST', raw: '{' });
    assert.equal(response.status, 403); await response.text();
  }
  let response = await request('/matriculas/alta-inicial', { id: '3', method: 'POST', body: { ...enrollment, estudiante: identity } });
  assert.equal(response.status, 403); await response.text();
  f.state.users.get('1').activo = 0;
  response = await request('/estudiantes'); assert.equal(response.status, 401); await response.text();
  assert.equal(f.state.students.length, 0);
});
test('HTTP datos inválidos/JSON 400, tamaño 413 y parámetros repetidos 400', async () => {
  for (const body of [{ ...enrollment, estudiante: identity, estado: 'ACTIVA' }, { ...enrollment, estudiante: { nombres: 'Ana' } }]) {
    const response = await request('/matriculas/alta-inicial', { method: 'POST', body });
    assert.equal(response.status, 400); await response.text();
  }
  for (const [raw, status] of [['{', 400], [JSON.stringify({ nombres: 'x'.repeat(9000) }), 413]]) {
    const response = await request('/estudiantes', { method: 'POST', raw }); assert.equal(response.status, status); await response.text();
  }
  for (const path of ['/estudiantes?estudiante_id=1&estudiante_id=2', '/matriculas?fecha=2026-02-30',
    '/secciones/11/padron', '/secciones/18446744073709551616/padron?fecha=2026-03-01']) {
    const response = await request(path); assert.equal(response.status, 400); await response.text();
  }
});
test('HTTP falla de auditoría: 500 seguro y rollback de las tres entidades', async () => {
  f.state.fail = sql => { if (sql.includes('INSERT INTO auditoria')) throw new Error('SQL y credenciales ficticias'); };
  const response = await request('/matriculas/alta-inicial', { id: '2', method: 'POST', body: { ...enrollment, estudiante: identity } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'No se pudo procesar la solicitud.' });
  assert.equal(f.state.students.length + f.state.matriculas.length + f.state.links.length + f.state.audits.length, 0);
});
test('HTTP REGISTRADOR requiere ambas asignaciones y no descubre el padrón ajeno', async () => {
  await f.matriculas.createJoint({ ...enrollment, estudiante: identity }, f.actor('2'));
  f.state.assignments.push({ usuario_id: '4', seccion_id: '11', fecha_inicio: '2026-11-01', fecha_fin: null });
  let response = await request('/secciones/11/padron?fecha=2026-03-01', { id: '4' });
  assert.equal(response.status, 404); await response.text();
  f.state.assignments.push({ usuario_id: '4', seccion_id: '11', fecha_inicio: '2026-03-01', fecha_fin: '2026-03-01' });
  response = await request('/secciones/11/padron?fecha=2026-03-01', { id: '4' });
  assert.equal(response.status, 200); assert.equal((await response.json()).padron.length, 1);
});
