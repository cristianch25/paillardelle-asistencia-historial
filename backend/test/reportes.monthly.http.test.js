import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { monthlyReportFixture } from '../test-support/monthly-report-fixture.js';

test('ficha HTTP: un GET PDF autenticado, validación, permisos y descarga sin persistir', async () => {
  const f = monthlyReportFixture(), app = createApp({ authService: { authenticate: async () => f.state.actor }, reportsService: f.service });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = `http://127.0.0.1:${server.address().port}/api/reportes/asistencia-mensual.pdf`;
  const params = '?anio_escolar_id=1&seccion_id=10&mes=2026-03', headers = { Authorization: 'Bearer ficticio' };
  try {
    assert.equal((await fetch(root + params)).status, 401);
    assert.equal((await fetch(root + '?anio_escolar_id=1&seccion_id=10&mes=2026-13', { headers })).status, 400);
    const response = await fetch(root + params, { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="asistencia-2026-03-seccion-10.pdf"');
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    f.state.actor = { id: '1', rol: 'REGISTRADOR', activo: 1 }; f.state.assigned = [];
    assert.equal((await fetch(root + params, { headers })).status, 404);
    f.state.actor.rol = 'PORTERIA'; assert.equal((await fetch(root + params, { headers })).status, 403);
    f.state.actor = { id: '1', rol: 'ADMIN', activo: 1 }; f.state.students = Array.from({ length: 31 }, () => ({}));
    assert.equal((await fetch(root + params, { headers })).status, 422);
    f.state.students = []; assert.equal((await fetch(root + params, { headers })).status, 404);
    assert.equal((await fetch(root + params, { headers, method: 'POST' })).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
