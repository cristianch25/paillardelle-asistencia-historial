import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { superuserFixture } from '../test-support/superusuario-fixture.js';
import { createPasswordResetService } from '../src/modules/usuarios/usuarios.password.service.js';
import { isValidNewPassword } from '../src/shared/passwords.js';

test('API rechaza contraseñas cortas para ADMIN, SUBDIRECCION y REGISTRADOR antes de persistir', async t => {
  const f = await superuserFixture();
  const server = createApp(f).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const before = f.state.users.size;
  for (const [actor, rol] of [['9', 'ADMIN'], ['1', 'SUBDIRECCION'], ['1', 'REGISTRADOR']]) {
    for (const password of ['a', '1234567', '😀'.repeat(4)]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/usuarios`, {
        method: 'POST', headers: { Authorization: `Bearer ${f.tokens.issue(actor).access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombres: 'Ficticio', apellidos: 'Prueba', usuario: 'sin-persistir', rol,
          nivel_asignado: 'PRIMARIA', password }),
      });
      assert.equal(response.status, 400); await response.json();
    }
  }
  assert.equal(f.state.users.size, before); assert.equal(f.state.audits.length, 0);
});
test('restablecimiento no persiste si el generador devuelve una contraseña corta', async () => {
  let writes = 0;
  const service = createPasswordResetService({ repository: { reset() { writes++; } }, generate: () => 'a' });
  await assert.rejects(service.reset('1', {}, '9'));
  assert.equal(writes, 0);
  for (const value of ['abcdefgh', '😀'.repeat(8), 'á'.repeat(36)]) assert.equal(isValidNewPassword(value), true);
  for (const value of ['a', '1234567', '\ud800'.repeat(8), 'a'.repeat(73)]) assert.equal(isValidNewPassword(value), false);
});
