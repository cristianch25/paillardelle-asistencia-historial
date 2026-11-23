import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createApp } from '../src/app.js';

const secret = 'SecretoFicticioRenovacionSoloMocks-123456789';
function fixture() {
  let time = 1800000000;
  const tokens = createTokenService(() => ({ secret, expiresIn: 900 }), () => time);
  const user = { id: '1', rol: 'REGISTRADOR', activo: 1 };
  const service = createAuthService({ tokens, repository: { findById: async () => user } });
  return { tokens, user, service, advance: seconds => { time += seconds; } };
}
test('renueva JWT corto, usa vencimiento real y conserva inicio firmado hasta ocho horas', async () => {
  const f = fixture(), original = f.tokens.issue('1'); let current = original;
  for (let elapsed = 780; elapsed < 28800; elapsed += 780) {
    f.advance(780); current = await f.service.renew(current.access_token);
    const payload = jwt.decode(current.access_token);
    assert.equal(payload.exp, current.expires_at);
    assert.equal(current.session_expires_at, original.session_expires_at);
    assert.ok(payload.exp - payload.iat <= 900);
    assert.equal(payload.auth_time, original.session_expires_at - 28800);
  }
  f.advance(28800 - 780 * 36);
  await assert.rejects(f.service.renew(current.access_token), { status: 401 });
});
test('no renueva JWT vencidos, manipulados, antiguos sin inicio o con máximo ampliado', async () => {
  const f = fixture(), original = f.tokens.issue('1');
  const payload = jwt.decode(original.access_token);
  for (const token of [original.access_token + 'x',
    jwt.sign({ ...payload, auth_time: undefined }, secret),
    jwt.sign({ ...payload, exp: payload.auth_time + 28801 }, secret)]) {
    await assert.rejects(f.service.renew(token), { status: 401 });
  }
  f.advance(900);
  await assert.rejects(f.service.renew(original.access_token), { status: 401 });
});
test('los cuatro roles se leen de nuevo; cuenta inactiva y contraseña obligatoria impiden renovar', async () => {
  const f = fixture(), token = f.tokens.issue('1').access_token;
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) {
    f.user.rol = rol;
    assert.equal((await f.service.renew(token)).user.rol, rol);
  }
  f.user.activo = 0;
  await assert.rejects(f.service.renew(token), { status: 401 });
  f.user.activo = 1; f.user.rol = 'ADMIN'; f.user.debe_cambiar_password = true;
  await assert.rejects(f.service.renew(token), { status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
});
test('HTTP renovar exige JWT y aplica 401/403 de servidor sin ampliar permisos', async t => {
  const f = fixture();
  const server = createApp({ authService: f.service }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const request = token => fetch(`http://127.0.0.1:${server.address().port}/api/auth/renovar`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  assert.equal((await request()).status, 401);
  const token = f.tokens.issue('1').access_token;
  const response = await request(token);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  f.user.rol = 'ADMIN'; f.user.debe_cambiar_password = true;
  const denied = await request(token); assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'PASSWORD_CHANGE_REQUIRED');
  f.user.activo = 0; assert.equal((await request(token)).status, 401);
});
