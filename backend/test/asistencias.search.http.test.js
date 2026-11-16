import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { attendanceSearchFixture } from '../test-support/asistencia-search-fixture.js';

test('HTTP búsqueda: ruta autenticada, contrato, parámetros repetidos y errores seguros', async () => {
  const f = attendanceSearchFixture();
  const authService = { async authenticate(token) { return { id: token }; } };
  const server = createApp({ authService, attendanceService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/asistencias/busqueda-estudiantes`;
  async function request(query, token, status) {
    const response = await fetch(base + query, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  try {
    await request('?fecha=2026-11-13', null, 401);
    await request('?fecha=2026-11-13', '4', 403);
    const body = await request('?fecha=2026-11-13&q=perez&limit=1', '2', 200);
    assert.equal(body.resultados[0].estado, 'FALTA'); assert.equal(body.pagination.has_more, true);
    for (const query of ['', '?fecha=2026-02-29', '?fecha=2026-11-13&q=a&q=b',
      '?fecha=2026-11-13&fecha=2026-11-14', '?fecha=2026-11-13&limit=101', '?fecha=2026-11-13&extra=1']) {
      await request(query, '1', 400);
    }
    f.fail('read');
    assert.deepEqual(await request('?fecha=2026-11-13', '1', 500), { error: 'No se pudo procesar la solicitud.' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
