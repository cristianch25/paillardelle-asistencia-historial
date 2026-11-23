import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';

let vite, factory, http;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  factory = (await vite.ssrLoadModule('/src/features/auth/authSessionLifecycle.ts')).createAuthSessionLifecycle;
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
});
after(async () => { await vite?.close(); });
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t, { required = false } = {}) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const records = new Map(), events = new Map();
  const doc = { visibilityState: 'visible' };
  globalThis.document = doc;
  globalThis.window = { sessionStorage: { getItem: k => records.get(k) ?? null,
    setItem: (k, v) => records.set(k, v), removeItem: k => records.delete(k) },
    addEventListener: (k, v) => { if (!events.has(k)) events.set(k, new Set()); events.get(k).add(v); },
    removeEventListener: (k, v) => events.get(k)?.delete(v) };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1800000000000 });
  const user = { id: '1', rol: 'ADMIN', debe_cambiar_password: required };
  const state = { renewals: 0, mode: 'ok', hold: null, absolute: Date.now() / 1000 + 28800, generation: 0 };
  const response = (config, data) => ({ config, data, status: 200, headers: {} });
  const issued = () => ({ access_token: `FICTICIO-${++state.generation}`, token_type: 'Bearer', expires_in: 900,
    expires_at: Math.min(Date.now() / 1000 + 900, state.absolute), session_expires_at: state.absolute, user: { ...user } });
  http.httpClient.defaults.adapter = async config => {
    if (config.url === '/auth/login') return response(config, issued());
    if (config.url === '/auth/me') return response(config, { user: { ...user } });
    if (config.url === '/auth/renovar') {
      state.renewals++; const data = issued();
      if (state.hold) await state.hold.promise;
      if (state.mode !== 'ok') throw new AxiosError('HTTP', '', config, null,
        state.mode === 'network' ? undefined : { status: Number(state.mode), config, data: {} });
      return response(config, data);
    }
    return response(config, {});
  };
  const life = factory(), disconnect = life.connect();
  t.after(() => { life.signOut(); disconnect(); t.mock.timers.reset(); globalThis.window = oldWindow; globalThis.document = oldDocument; });
  await life.signIn({ usuario: 'ficticio', password: 'ficticia' });
  const event = (type = 'keydown', isTrusted = true) => events.get(type)?.forEach(fn => fn({ isTrusted }));
  const tick = async ms => { t.mock.timers.tick(ms); await flush(); };
  return { life, state, event, tick, records, doc, user };
}
test('actividad conserva sesión más de quince minutos; vencimiento coincide con el servidor', async t => {
  const f = await fixture(t);
  for (let minute = 0; minute < 35; minute++) { await f.tick(60000); f.event(); await flush(); }
  assert.ok(f.life.snapshot().session); assert.ok(f.state.renewals >= 2);
  const stored = JSON.parse(f.records.get('paillardelle.auth'));
  assert.equal(f.life.snapshot().session.expiresAt, stored.expiresAt);
  assert.equal(stored.absoluteExpiresAt, f.state.absolute * 1000);
});
test('polling, focus y eventos sintéticos no renuevan; pestaña abandonada expira', async t => {
  const f = await fixture(t);
  for (let minute = 0; minute < 15; minute++) {
    await http.httpClient.get('/polling'); f.event('focus'); f.event('keydown', false); await f.tick(60000);
  }
  assert.equal(f.state.renewals, 0); assert.equal(f.life.snapshot().session, null); assert.equal(f.records.size, 0);
});
test('pestaña oculta ignora actividad y expira; ocho horas nunca se prolongan con actividad', async t => {
  const f = await fixture(t); f.doc.visibilityState = 'hidden';
  for (let i = 0; i < 15; i++) { await f.tick(60000); f.event(); }
  assert.equal(f.state.renewals, 0); assert.equal(f.life.snapshot().session, null);
  f.doc.visibilityState = 'visible';
  await f.life.signIn({ usuario: 'ficticio', password: 'ficticia' });
  for (let i = 0; i < 465; i++) { f.event(); await f.tick(60000); }
  assert.equal(Date.now(), f.state.absolute * 1000); assert.equal(f.life.snapshot().session, null);
});
test('quince minutos desde última actividad cierra incluso después de renovar', async t => {
  const f = await fixture(t);
  await f.tick(780000); f.event(); await flush();
  assert.equal(f.state.renewals, 1);
  await f.tick(899000); assert.ok(f.life.snapshot().session);
  await f.tick(1000); assert.equal(f.life.snapshot().session, null);
});
test('403 y red no borran sesión vigente; fallar renovación no dispara peticiones paralelas', async t => {
  const f = await fixture(t);
  await f.tick(780000); f.state.hold = Promise.withResolvers(); f.state.mode = 'network';
  f.event(); await flush(); f.event(); await f.tick(15000); f.event();
  assert.equal(f.state.renewals, 1); assert.ok(f.life.snapshot().session);
  f.state.hold.resolve(); await flush(); assert.ok(f.life.snapshot().session);
  f.state.hold = null; f.state.mode = '403'; await f.tick(30000);
  assert.ok(f.life.snapshot().session);
  f.state.mode = 'ok'; await f.tick(30000); assert.ok(f.life.snapshot().session);
});
test('ADMIN obligado no renueva; 401 cierra; respuesta tardía no sustituye login nuevo', async t => {
  const f = await fixture(t, { required: true });
  await f.tick(780000); f.event(); await flush(); assert.equal(f.state.renewals, 0);
  f.user.debe_cambiar_password = false; await f.life.verifySession();
  f.state.hold = Promise.withResolvers(); f.event(); await flush();
  const pending = f.state.hold; assert.equal(f.state.renewals, 1);
  await f.life.signIn({ usuario: 'otra', password: 'ficticia' });
  const token = JSON.parse(f.records.get('paillardelle.auth')).token;
  pending.resolve(); await flush();
  assert.equal(JSON.parse(f.records.get('paillardelle.auth')).token, token);
  f.state.hold = null; f.state.mode = '401';
  await f.tick(780000); f.event(); await flush(); assert.equal(f.life.snapshot().session, null);
});
test('login lento usa la expiración emitida tras la espera y no el inicio de la petición', async t => {
  const f = await fixture(t), original = http.httpClient.defaults.adapter;
  http.httpClient.defaults.adapter = async config => {
    if (config.url === '/auth/login') t.mock.timers.tick(5000);
    return original(config);
  };
  await f.life.signIn({ usuario: 'ficticio', password: 'ficticia' });
  assert.equal(f.life.snapshot().session.expiresAt, Date.now() + 900000);
});
test('401 de token anterior y renovación tardía no retiran ni sustituyen el estado actual', async t => {
  const f = await fixture(t), original = http.httpClient.defaults.adapter, pending = Promise.withResolvers();
  let oldConfig;
  http.httpClient.defaults.adapter = async config => {
    if (config.url === '/vieja') { oldConfig = config; return pending.promise; }
    if (config.url === '/restringida') throw new AxiosError('HTTP', '', config, null,
      { config, status: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' } });
    return original(config);
  };
  const old = http.httpClient.get('/vieja'); const handled = assert.rejects(old); await flush();
  await f.tick(780000); f.event(); await flush();
  pending.reject(new AxiosError('HTTP', '', oldConfig, null, { config: oldConfig, status: 401, data: {} }));
  await handled; assert.ok(f.life.snapshot().session);
  await f.tick(780000); f.state.hold = Promise.withResolvers(); f.event(); await flush();
  await assert.rejects(http.httpClient.get('/restringida'));
  f.state.hold.resolve(); await flush();
  assert.equal(f.life.snapshot().session.user.debe_cambiar_password, true);
});
test('recarga y fallo temporal al restaurar conservan última actividad y permiten reintentar', async t => {
  const f = await fixture(t), original = http.httpClient.defaults.adapter;
  await f.tick(60000); f.event();
  const activity = JSON.parse(f.records.get('paillardelle.auth')).lastActivityAt;
  http.httpClient.defaults.adapter = async config => {
    if (config.url === '/auth/me') throw new AxiosError('red', 'ERR_NETWORK', config);
    return original(config);
  };
  await f.life.restore(); assert.equal(f.life.snapshot().initialization, 'error');
  assert.equal(JSON.parse(f.records.get('paillardelle.auth')).lastActivityAt, activity);
  http.httpClient.defaults.adapter = original; await f.life.restore();
  assert.ok(f.life.snapshot().session);
  assert.equal(JSON.parse(f.records.get('paillardelle.auth')).lastActivityAt, activity);
});
test('F5 conserva actividad pendiente de renovación y no acorta los quince minutos de inactividad', async t => {
  const f = await fixture(t);
  await f.tick(60000); f.event(); await f.tick(660000);
  await f.life.restore(); await f.tick(90000);
  assert.equal(f.state.renewals, 1); assert.ok(f.life.snapshot().session);
  await f.tick(120000); assert.ok(f.life.snapshot().session);
  await f.tick(30000); assert.equal(f.life.snapshot().session, null);
});
