import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AxiosError } from 'axios';

let vite, Auth, Guard, api, http;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  Guard = (await vite.ssrLoadModule('/src/features/auth/ProtectedRoute.tsx')).default;
  api = await vite.ssrLoadModule('/src/features/auth/auth.api.ts');
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
});
after(async () => { await vite?.close(); });

test('ADMIN pendiente no monta módulos institucionales; los otros tres roles no heredan la restricción', () => {
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) for (const required of [true, false]) {
    const markup = renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { rol, debe_cambiar_password: required } },
      initialization: 'ready', signOut() {}, verifySession: async () => {} } },
    h(MemoryRouter, { initialEntries: [rol === 'SUPERUSUARIO' ? '/administradores' : '/inicio'] },
      h(Routes, null, h(Route, { element: h(Guard) }, h(Route, { path: '*', element: h('p', null, 'MODULO_INSTITUCIONAL') }))))));
    const blocked = rol === 'ADMIN' && required;
    assert.equal(markup.includes('Cambio obligatorio de contraseña'), blocked);
    assert.equal(markup.includes('MODULO_INSTITUCIONAL'), !blocked);
    if (blocked) { assert.match(markup, /Cerrar sesión/); assert.doesNotMatch(markup, />Cancelar</); }
  }
});

test('/me exige un indicador booleano para ADMIN y no deduce temporalidad si falta o es inválido', async () => {
  for (const flag of [true, false, undefined, 1, 'false']) {
    http.httpClient.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: {
      user: { id: '1', rol: 'ADMIN', debe_cambiar_password: flag },
    } });
    const call = api.getCurrentUser(new AbortController().signal);
    if (typeof flag === 'boolean') assert.equal((await call).debe_cambiar_password, flag);
    else await assert.rejects(call);
  }
});

test('403 específico restringe la sesión vigente; permisos normales y respuestas de sesiones antiguas no lo hacen', async () => {
  let session = { token: 'FICTICIO', signal: new AbortController().signal }, restricted = 0, calls = 0;
  const disconnect = http.connectHttpSession({ current: () => session, unauthorized: () => assert.fail('No es logout'),
    passwordChangeRequired: () => { restricted++; } });
  try {
    for (const scenario of ['normal', 'required', 'old']) {
      await assert.rejects(http.httpClient.get('/usuarios', { adapter: async config => {
        calls++;
        if (scenario === 'old') session = { ...session, signal: new AbortController().signal };
        throw new AxiosError('Detalle no público', '', config, null, { config, status: 403,
          data: { code: scenario === 'normal' ? 'OTHER_PERMISSION' : 'PASSWORD_CHANGE_REQUIRED' } });
      } }));
    }
    assert.equal(restricted, 1); assert.equal(calls, 3);
  } finally { disconnect(); }
});

test('una respuesta antigua de /me no retira una restricción recibida después; solo una nueva consulta la actualiza', async () => {
  const previousWindow = globalThis.window, records = new Map();
  globalThis.window = { sessionStorage: { getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) },
  addEventListener() {}, removeEventListener() {} };
  const factory = (await vite.ssrLoadModule('/src/features/auth/authSessionLifecycle.ts')).createAuthSessionLifecycle;
  const lifecycle = factory(), disconnect = lifecycle.connect();
  const response = (config, data) => ({ config, status: 200, headers: {}, data });
  const profile = config => response(config, { user: { id: '1', rol: 'ADMIN', debe_cambiar_password: false } });
  try {
    http.httpClient.defaults.adapter = async config => config.url === '/auth/login'
      ? response(config, { access_token: 'FICTICIO', token_type: 'Bearer', expires_in: 900 }) : profile(config);
    await lifecycle.signIn({ usuario: 'ficticio', password: 'ficticia' });
    const pending = Promise.withResolvers(), started = Promise.withResolvers();
    http.httpClient.defaults.adapter = async config => {
      if (config.url === '/auth/me') { started.resolve(); await pending.promise; return profile(config); }
      throw new AxiosError('HTTP', '', config, null, { status: 403, data: { code: 'PASSWORD_CHANGE_REQUIRED' }, config });
    };
    const old = lifecycle.verifySession(); await started.promise;
    await assert.rejects(http.httpClient.get('/usuarios'));
    assert.equal(lifecycle.snapshot().session.user.debe_cambiar_password, true);
    pending.resolve(); await old;
    assert.equal(lifecycle.snapshot().session.user.debe_cambiar_password, true);
    http.httpClient.defaults.adapter = async config => profile(config);
    await lifecycle.verifySession();
    assert.equal(lifecycle.snapshot().session.user.debe_cambiar_password, false);
  } finally { lifecycle.signOut(); disconnect(); globalThis.window = previousWindow; }
});
