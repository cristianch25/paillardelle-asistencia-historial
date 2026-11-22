import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router';

let vite, api, authApi, client, navigation, presentation, Auth, Guard, Page;
const admin = { id: '1', nombres: 'Ana', apellidos: 'Ficticia', usuario: 'admin.ana', rol: 'ADMIN', activo: true };
const draft = { nombres: 'Ana', apellidos: 'Ficticia', usuario: 'admin.ana', password: 'ClaveFicticia' };
const response = (config, data, status = 200) => ({ config, data, status, statusText: 'OK', headers: {} });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/usuarios/adminAccounts.api.ts');
  authApi = await vite.ssrLoadModule('/src/features/auth/auth.api.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
  presentation = await vite.ssrLoadModule('/src/features/auth/userPresentation.ts');
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  Guard = (await vite.ssrLoadModule('/src/features/auth/ProtectedRoute.tsx')).default;
  Page = (await vite.ssrLoadModule('/src/features/usuarios/AdminAccountsPage.tsx')).default;
});
after(async () => { await vite?.close(); });

test('cuatro roles: navegación técnica exclusiva, perfil SUPERUSUARIO y rutas institucionales conservadas', () => {
  assert.deepEqual(navigation.navigationFor('SUPERUSUARIO').map(item => item.path), ['/administradores', '/seguridad']);
  assert.equal(presentation.userIdentityLabel({ rol: 'SUPERUSUARIO', cargo: 'DOCENTE' }), 'SUPERUSUARIO');
  assert.equal(presentation.primaryLevelLabel({ rol: 'SUPERUSUARIO', nivel_asignado: 'PRIMARIA' }), undefined);
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    assert.equal(navigation.navigationFor(rol).some(item => item.path === '/administradores'), false);
    assert.equal(navigation.navigationFor(rol)[0].path, '/inicio');
    const markup = renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { rol } }, initialization: 'ready' } },
      h(MemoryRouter, null, h(Page))));
    assert.equal(markup, '');
  }
});

test('guardia: SUPERUSUARIO no monta contenido de URL académica, incluso con barra final', () => {
  for (const rol of ['SUPERUSUARIO', 'ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) for (const path of ['/inicio', '/secciones/', '/usuarios', '/reportes']) {
    const markup = renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { rol } }, initialization: 'ready' } },
      h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { element: h(Guard) },
        h(Route, { path: '*', element: h('p', null, 'CONTENIDO_ACADEMICO') }))))));
    assert.equal(markup.includes('CONTENIDO_ACADEMICO'), rol !== 'SUPERUSUARIO');
  }
});

test('autenticación admite SUPERUSUARIO y continúa rechazando roles no implementados', async () => {
  client.defaults.adapter = async config => response(config, { user: { ...admin, rol: 'SUPERUSUARIO' } });
  assert.equal((await authApi.getCurrentUser(new AbortController().signal)).rol, 'SUPERUSUARIO');
  client.defaults.adapter = async config => response(config, { user: { ...admin, rol: 'PORTERIA' } });
  await assert.rejects(authApi.getCurrentUser(new AbortController().signal));
});

test('listado ADMIN paginado: una sola API, representación pública y rechazo de roles ajenos', async () => {
  const calls = [];
  client.defaults.adapter = async config => {
    calls.push(config.url);
    assert.deepEqual(config.params, { page: 2, limit: 20 });
    return response(config, { users: [{ ...admin, password_hash: 'NO_CONSERVAR', token: 'NO_CONSERVAR' }], pagination: { page: 2, limit: 20, has_more: false } });
  };
  assert.deepEqual((await api.getAdminAccounts(2)).users, [admin]);
  assert.deepEqual(calls, ['/usuarios']);
  client.defaults.adapter = async config => response(config, { users: [{ ...admin, rol: 'SUPERUSUARIO' }], pagination: { page: 1, limit: 20, has_more: false } });
  await assert.rejects(api.getAdminAccounts(1));
});

test('creación siempre envía ADMIN, sin roles seleccionables ni permisos adicionales', async () => {
  let calls = 0;
  client.defaults.adapter = async config => {
    calls++;
    assert.equal(config.method, 'post'); assert.equal(config.url, '/usuarios');
    assert.deepEqual(JSON.parse(config.data), { ...draft, rol: 'ADMIN' });
    return response(config, { user: admin }, 201);
  };
  await api.createAdminAccount({ ...draft, rol: 'SUPERUSUARIO', activo: false });
  assert.equal(calls, 1);
  for (const password of ['', 'á'.repeat(37), '\ud800']) assert.throws(() => api.adminRequest({ ...draft, password }));
  for (const nombres of ['', '\ud800', 'a'.repeat(101)]) assert.throws(() => api.adminRequest({ ...draft, nombres }));
});

test('respuesta de creación incompleta o con rol incorrecto se trata como falta de confirmación', async () => {
  for (const user of [null, { ...admin, rol: 'REGISTRADOR' }, { ...admin, usuario: 'otro' }]) {
    let calls = 0;
    client.defaults.adapter = async config => { calls++; return response(config, { user }, 201); };
    await assert.rejects(api.createAdminAccount(draft)); assert.equal(calls, 1);
  }
});

test('listado inconsistente o paginación incompleta no publica datos parciales', async () => {
  for (const data of [
    { users: [admin, admin], pagination: { page: 1, limit: 20, has_more: false } },
    { users: [admin], pagination: { page: 2, limit: 20, has_more: false } },
    { users: [], pagination: { page: 1, limit: 20, has_more: true } },
    { users: [admin], pagination: { page: 1, limit: 100, has_more: false } },
  ]) {
    client.defaults.adapter = async config => response(config, data);
    await assert.rejects(api.getAdminAccounts(1));
  }
});
