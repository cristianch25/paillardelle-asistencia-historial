import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { openingFixture } from '../test-support/anios-open-pool.js';

test('cierre HTTP: autenticación, ADMIN, contrato, conflictos, auditoría y errores seguros', async () => {
  const fixture = openingFixture({ year: { id: '1', estado: 'ABIERTO', fecha_inicio: '2000-01-01', fecha_fin: '2000-12-31' } });
  fixture.state.users.set('3', { id: '3', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' });
  fixture.state.users.set('4', { id: '4', rol: 'REGISTRADOR', activo: 1 });
  const tokens = createTokenService(() => ({ secret: 'cierre-http-ficticio-sin-validez-real-123456', expiresIn: 900 }));
  const authService = createAuthService({ tokens, repository: { findById: async id => fixture.state.users.get(id) } });
  const server = createApp({ authService, aniosEscolaresService: fixture.service }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const send = (path = '/1/cerrar', { id = '1', raw = '{}' } = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/anios-escolares${path}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(id ? { Authorization: `Bearer ${tokens.issue(id).access_token}` } : {}) }, body: raw });
  try {
    for (const [id, status] of [['', 401], ['3', 403], ['4', 403]]) {
      const response = await send(undefined, { id, raw: '{' }); assert.equal(response.status, status);
    }
    for (const raw of ['{', 'null', '[]', '{"fecha_fin":"2000-01-01"}']) assert.equal((await send(undefined, { raw })).status, 400);
    assert.equal((await send(undefined, { raw: JSON.stringify({ motivo: 'x'.repeat(9000) }) })).status, 413);
    assert.equal((await send('/01/cerrar')).status, 400);
    assert.equal((await send('/999/cerrar')).status, 404);
    fixture.state.failAt = 'audit';
    const failure = await send(); assert.equal(failure.status, 500);
    assert.equal(/SQL|credenciales|password|token/.test(await failure.text()), false);
    assert.equal(fixture.state.year.estado, 'ABIERTO'); assert.equal(fixture.state.audits.length, 0);
    fixture.state.failAt = undefined;
    const response = await send(); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).anio_escolar.estado, 'CERRADO');
    assert.equal((await send()).status, 409); assert.equal(fixture.state.audits.length, 1);
    assert.equal((await send('/1/abrir')).status, 409); assert.equal((await send('/1/reabrir')).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
