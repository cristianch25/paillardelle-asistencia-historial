import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { attendanceListFixture } from '../test-support/asistencia-list-fixture.js';

test('HTTP listado: GET autenticado, filtros, paginación, Cache-Control y errores seguros', async () => {
  const f = attendanceListFixture();
  const authService = { async authenticate(token) {
    if (!['1', '2', '3', '4'].includes(token)) throw Object.assign(new Error('Privado'), { status: 401 });
    return { id: token };
  } };
  const server = createApp({ authService, attendanceService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/asistencias/sesiones`;
  async function request(query, token, status) {
    const response = await fetch(base + query, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  try {
    await request('?anio_escolar_id=1&fecha=2026-11-13', null, 401);
    const result = await request('?anio_escolar_id=1&fecha=2026-11-13&nivel=PRIMARIA&limit=1', '2', 200);
    assert.equal(result.secciones[0].situacion, 'CERRADA');
    await request('?anio_escolar_id=1&fecha=2026-11-13&nivel=SECUNDARIA', '2', 403);
    await request('?anio_escolar_id=1&fecha=2026-11-13&seccion_id=1', '3', 404);
    await request('?fecha=2026-11-13', '1', 400);
    await request('?anio_escolar_id=1&fecha=2026-11-13&fecha=2026-11-14', '1', 400);
    f.fail('read');
    const failed = await request('?anio_escolar_id=1&fecha=2026-11-13', '1', 500);
    assert.deepEqual(failed, { error: 'No se pudo procesar la solicitud.' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
