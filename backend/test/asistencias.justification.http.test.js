import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { attendanceFixture } from '../test-support/asistencia-fixture.js';
import { attendanceSearchFixture } from '../test-support/asistencia-search-fixture.js';

test('HTTP justificación: PATCH conjunto, GET, clientes previos, conflicto y errores', async () => {
  const f = attendanceFixture(); await f.open();
  const server = createApp({ authService: { authenticate: async id => ({ id }) }, attendanceService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/asistencias/sesiones/1`;
  const row = { asistencia_id: '1', version: 0, estado: 'TARDANZA', justificada: true, motivo_justificacion: 'Atención médica' };
  async function patch(body, status, token = '2') {
    const response = await fetch(base + '/registros', { method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body) });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  try {
    await patch({ version: 1, cambios: [row] }, 401, null);
    await patch({ version: 1, cambios: [{ ...row, motivo_justificacion: '' }] }, 400);
    const result = await patch({ version: 1, cambios: [row] }, 200);
    assert.equal(result.padron[0].justificada, true); assert.equal(result.padron[0].motivo_justificacion, 'Atención médica');
    const detail = await fetch(base, { headers: { Authorization: 'Bearer 2' } });
    assert.deepEqual((await detail.json()).padron, result.padron);
    await patch({ version: 2, cambios: [{ asistencia_id: '1', version: 1, estado: 'TARDANZA' }] }, 200);
    assert.equal(f.state.history.length, 1);
    await patch({ version: 2, cambios: [{ ...row, version: 1, justificada: false, motivo_justificacion: null }] }, 409);
    await patch({ version: 1, cambios: [row] }, 409);
    f.state.assigned = [];
    await patch({ version: 2, cambios: [{ ...row, version: 1 }] }, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('lectura búsqueda: motivo y booleano de marca; sin asistencia devuelve false/null', async () => {
  const f = attendanceSearchFixture();
  Object.assign(f.state.records[0], { justificada: 1, motivo_justificacion: 'Atención médica' });
  const result = await f.service.searchStudents({ fecha: '2026-11-13' }, f.actor('1'));
  assert.equal(result.resultados[0].justificada, true);
  assert.equal(result.resultados[0].motivo_justificacion, 'Atención médica');
  for (const row of result.resultados.slice(1)) {
    assert.equal(row.justificada, false); assert.equal(row.motivo_justificacion, null);
  }
  assert.match(f.calls.at(-1).sql, /a.justificada, a.motivo_justificacion/);
});
