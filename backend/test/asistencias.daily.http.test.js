import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { attendanceFixture } from '../test-support/asistencia-fixture.js';

test('HTTP diario: PATCH sin motivo antes/después del cierre; cierre compatible y justificación protegida', async () => {
  const f = attendanceFixture();
  const server = createApp({ authService: { authenticate: async id => ({ id }) }, attendanceService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/asistencias/sesiones`;
  async function request(suffix, status, body, method = 'POST') {
    const response = await fetch(base + suffix, { method, headers: { Authorization: 'Bearer 2', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  }
  async function save(estado, extras = {}, status = 200) {
    return request('/1/registros', status, { version: f.state.session.version,
      cambios: [{ asistencia_id: '1', version: f.state.rows[0].version, estado, ...extras }] }, 'PATCH');
  }
  try {
    await request('', 201, { seccion_id: '1', fecha: '2026-11-13' });
    await save('FALTA'); await save('TARDANZA');
    assert.equal(f.state.session.estado, 'ABIERTA'); assert.equal(f.state.history.length, 2);
    const closed = await request('/1/cierre', 200, { version: f.state.session.version });
    assert.equal(closed.advertencias[0].cantidad, 4);
    const result = await save('FALTA');
    assert.equal(result.sesion.estado, 'CERRADA'); assert.equal(f.state.history.at(-1).motivo, null);
    assert.equal(f.state.history.at(-1).posterior_cierre, true);
    await save('PENDIENTE'); await save('TARDANZA');
    await save('TARDANZA', { justificada: true }, 400);
    await save('TARDANZA', { justificada: true, motivo_justificacion: 'Salud' });
    const before = structuredClone(f.state);
    await save('TARDANZA'); assert.deepEqual(f.state, before);
    await save('FALTA', {}, 409); assert.deepEqual(f.state, before);
    const detail = await request('/1', 200, undefined, 'GET');
    assert.equal(detail.padron[0].motivo_justificacion, 'Salud');
    await request('/1/cierre', 200, { version: f.state.session.version });
    assert.equal(f.state.audits.length, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
