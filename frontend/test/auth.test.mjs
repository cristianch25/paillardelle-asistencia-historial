import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AxiosError } from 'axios';

// Pruebas aisladas: no emiten JWT, no autentican cuentas ni consultan MySQL.
let vite;
let http;
let errors;
let Provider;
let LoginPage;
let ProtectedRoute;
let navigation;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  errors = await vite.ssrLoadModule('/src/shared/api/apiError.ts');
  Provider = (await vite.ssrLoadModule('/src/features/auth/AuthProvider.tsx')).default;
  LoginPage = (await vite.ssrLoadModule('/src/features/auth/LoginPage.tsx')).default;
  ProtectedRoute = (await vite.ssrLoadModule('/src/features/auth/ProtectedRoute.tsx')).default;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
});
after(async () => { await vite?.close(); });

test('cada rol solo dispone de Inicio; no se anuncian módulos pendientes', () => {
  for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    assert.deepEqual(navigation.navigationFor(role).map(({ path, label }) => ({ path, label })),
      [{ path: '/inicio', label: 'Inicio' }]);
    assert.equal(typeof navigation.roleLabels[role], 'string');
  }
});

function renderRoute(element, path) {
  return renderToStaticMarkup(createElement(Provider, null,
    createElement(MemoryRouter, { initialEntries: [path] }, element)));
}

test('login público muestra campos reales y escudo, sin contenido autenticado', () => {
  const markup = renderRoute(createElement(LoginPage), '/login');
  assert.match(markup, /name="usuario"/);
  assert.match(markup, /name="password"/);
  assert.match(markup, /type="password"/);
  assert.match(markup, /autocomplete="current-password"/i);
  assert.match(markup, /images\/escudo-paillardelle.png/);
  assert.doesNotMatch(markup, /Sesión iniciada/);
});

test('ruta protegida sin sesión no renderiza su contenido', () => {
  const routes = createElement(Routes, null,
    createElement(Route, { element: createElement(ProtectedRoute) },
      createElement(Route, { path: '/sesion', element: createElement('p', null, 'CONTENIDO_RESTRINGIDO') })));
  assert.doesNotMatch(renderRoute(routes, '/sesion'), /CONTENIDO_RESTRINGIDO/);
});

test('Bearer centralizado; 403 conserva sesión; 401 invalida solo la petición vigente', async () => {
  let current = { token: 'marcador-de-transporte-no-jwt', signal: new AbortController().signal };
  let invalidations = 0;
  const disconnect = http.connectHttpSession({
    current: () => current,
    unauthorized: () => { invalidations++; },
  });
  try {
    for (const status of [403, 401]) {
      await assert.rejects(http.httpClient.get('/auth/me', { adapter: async config => {
        assert.equal(config.headers.get('Authorization'), `Bearer ${current.token}`);
        const response = { status, data: { error: 'Error HTTP de prueba' }, config };
        throw new AxiosError('HTTP', 'ERR_BAD_REQUEST', config, undefined, response);
      } }));
      assert.equal(invalidations, status === 401 ? 1 : 0);
    }
    await assert.rejects(http.httpClient.get('/auth/me', { adapter: async config => {
      // Una nueva sesión puede recibir el mismo JWT: comparar también el ámbito cancelable.
      current = { ...current, signal: new AbortController().signal };
      throw new AxiosError('HTTP', 'ERR_BAD_REQUEST', config, undefined, { status: 401, config });
    } }));
    assert.equal(invalidations, 1);
  } finally { disconnect(); }
});

test('login no incorpora Bearer ni reintenta el POST fallido', async () => {
  let requests = 0;
  const disconnect = http.connectHttpSession({
    current: () => ({ token: 'marcador-de-transporte-no-jwt', signal: new AbortController().signal }),
    unauthorized: () => assert.fail('Un login fallido no invalida otra sesión'),
  });
  try {
    await assert.rejects(http.httpClient.post('/auth/login', {}, { adapter: async config => {
      requests++;
      assert.equal(config.headers.get('Authorization'), undefined);
      throw new AxiosError('HTTP', 'ERR_BAD_REQUEST', config, undefined, { status: 401, config });
    } }));
    assert.equal(requests, 1);
  } finally { disconnect(); }
});

test('cancelación impide enviar una solicitud autenticada pendiente', async () => {
  const controller = new AbortController();
  controller.abort();
  const disconnect = http.connectHttpSession({
    current: () => ({ token: 'marcador-de-transporte-no-jwt', signal: controller.signal }),
    unauthorized: () => assert.fail('No debe recibir respuesta'),
  });
  try {
    await assert.rejects(http.httpClient.get('/auth/me', {
      adapter: () => assert.fail('No debe enviar la solicitud'),
    }), error => error.code === 'ERR_CANCELED');
  } finally { disconnect(); }
});

test('mensajes diferencian 401/403 y no exponen errores originales', () => {
  const failure = status => new AxiosError('dato que no debe mostrarse', undefined, undefined,
    undefined, { status });
  assert.match(errors.apiErrorMessage(failure(401)), /sesión ya no es válida/);
  assert.match(errors.apiErrorMessage(failure(403)), /No tienes permiso/);
  assert.match(errors.apiErrorMessage(new AxiosError('detalle privado')), /conectar con el servidor/);
  assert.doesNotMatch(errors.apiErrorMessage(failure(500)), /dato que no debe mostrarse/);
});
