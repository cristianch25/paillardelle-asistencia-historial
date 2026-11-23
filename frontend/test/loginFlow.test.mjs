import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import bcrypt from '../../backend/node_modules/bcrypt/bcrypt.js';
import { createApp } from '../../backend/src/app.js';
import { createAuthService } from '../../backend/src/modules/auth/auth.service.js';
import { createTokenService } from '../../backend/src/modules/auth/auth.tokens.js';
import { createLoginLimit } from '../../backend/src/modules/auth/auth.login-limit.js';

let vite, createLifecycle, http;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  createLifecycle = (await vite.ssrLoadModule('/src/features/auth/authSessionLifecycle.ts')).createAuthSessionLifecycle;
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
});
after(async () => { await vite?.close(); });
async function fixture(t) {
  const previousWindow = globalThis.window, records = new Map();
  globalThis.window = { sessionStorage: { getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) },
    addEventListener() {}, removeEventListener() {} };
  let time = Date.now();
  const tokens = createTokenService(() => ({ secret: 'SoloMocksDiagnosticoLogin-123456789012345', expiresIn: 900 }));
  const hash = await bcrypt.hash('a', 4);
  const users = new Map(['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO'].map((rol, index) => {
    const id = String(index + 1);
    return [id, { id, usuario: `ficticio${id}`, rol, activo: 1, password_hash: hash, debe_cambiar_password: false }];
  }));
  const service = createAuthService({ tokens, loginLimit: createLoginLimit({ now: () => time }), repository: {
    findByUsername: async name => [...users.values()].find(user => user.usuario === name),
    findById: async id => users.get(id),
  } });
  const server = createApp({ authService: service }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const { AxiosError } = await import('axios');
  http.httpClient.defaults.adapter = async config => {
    const result = await fetch(base + config.url, { method: config.method, headers: config.headers.toJSON(),
      ...(config.data ? { body: config.data } : {}), signal: config.signal });
    const response = { config, status: result.status, data: await result.json(), headers: Object.fromEntries(result.headers) };
    if (!result.ok) throw new AxiosError('HTTP simulado', '', config, null, response);
    return response;
  };
  const lifecycle = createLifecycle(), disconnect = lifecycle.connect();
  t.after(async () => { lifecycle.signOut(); disconnect(); globalThis.window = previousWindow;
    await new Promise(resolve => server.close(resolve)); });
  return { lifecycle, users, records, advance: ms => { time += ms; } };
}
test('recorrido frontend/API/backend: contraseña antigua de un carácter funciona para los cuatro roles', async t => {
  const f = await fixture(t);
  for (const user of f.users.values()) {
    await f.lifecycle.signIn({ usuario: user.usuario, password: 'a' });
    assert.equal(f.lifecycle.snapshot().session.user.rol, user.rol);
    assert.ok(f.records.has('paillardelle.auth'));
    await f.lifecycle.restore(); assert.equal(f.lifecycle.snapshot().session.user.id, user.id);
    f.lifecycle.signOut();
  }
});
test('contraseña nueva válida funciona y obligación ADMIN se conserva al iniciar sesión', async t => {
  const f = await fixture(t), admin = f.users.get('1');
  admin.password_hash = await bcrypt.hash('NuevaValida123', 4); admin.debe_cambiar_password = true;
  await f.lifecycle.signIn({ usuario: admin.usuario, password: 'NuevaValida123' });
  assert.equal(f.lifecycle.snapshot().session.user.debe_cambiar_password, true);
});
test('credenciales incorrectas muestran margen real sin revelar existencia; bloqueo caduca sin cambiar hash', async t => {
  const f = await fixture(t), admin = f.users.get('1'), originalHash = admin.password_hash;
  for (let failed = 0; failed < 5; failed++) {
    for (const usuario of [admin.usuario, 'inexistente']) {
      await assert.rejects(f.lifecycle.signIn({ usuario, password: 'incorrecta' }), error => {
        assert.equal(error.response.status, failed === 4 ? 429 : 401);
        assert.equal(error.response.data.intentos_restantes, 4 - failed);
        return true;
      });
    }
  }
  await assert.rejects(f.lifecycle.signIn({ usuario: admin.usuario, password: 'a' }), error => {
    assert.equal(error.response.status, 429); assert.equal(error.response.data.intentos_restantes, 0);
    assert.ok(error.response.data.reintentar_en_segundos > 0); return true;
  });
  f.advance(60000);
  await f.lifecycle.signIn({ usuario: admin.usuario, password: 'a' });
  assert.equal(f.lifecycle.snapshot().session.user.id, admin.id);
  assert.equal(admin.password_hash, originalHash);
});
