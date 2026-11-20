import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

let vite, api, Dialog, Sidebar, Auth;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/auth/auth.api.ts');
  Dialog = (await vite.ssrLoadModule('/src/features/auth/ChangePasswordDialog.tsx')).default;
  Sidebar = (await vite.ssrLoadModule('/src/app/layout/AppSidebar.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
});

after(async () => {
  await vite?.close();
});

test('API changePassword envía POST /auth/cambiar-contrasena con los campos correctos', async () => {
  const http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  let capturedUrl = '', capturedBody = null;
  const originalPost = http.httpClient.post;
  http.httpClient.post = async (url, body) => {
    capturedUrl = url;
    capturedBody = body;
    return { data: { ok: true, message: 'Contraseña cambiada correctamente.' } };
  };
  try {
    const res = await api.changePassword({
      password_actual: 'Actual123',
      password_nueva: 'NuevaClave890',
      password_confirmacion: 'NuevaClave890',
    });
    assert.equal(capturedUrl, '/auth/cambiar-contrasena');
    assert.deepEqual(capturedBody, {
      password_actual: 'Actual123',
      password_nueva: 'NuevaClave890',
      password_confirmacion: 'NuevaClave890',
    });
    assert.equal(res.ok, true);
    assert.equal(res.message, 'Contraseña cambiada correctamente.');
  } finally {
    http.httpClient.post = originalPost;
  }
});

test('ChangePasswordDialog renderiza modal accesible con campos y botón de mostrar/ocultar', () => {
  const html = renderToStaticMarkup(h(Dialog, { onClose: () => {} }));
  assert.match(html, /<dialog/);
  assert.match(html, /Cambiar contraseña/);
  assert.match(html, /Contraseña actual/);
  assert.match(html, /Nueva contraseña \(mínimo 8 caracteres\)/);
  assert.match(html, /Confirmar nueva contraseña/);
  assert.match(html, /Mostrar contraseñas/);
  assert.match(html, /type="password"/);
  assert.match(html, /Cancelar/);
});

test('AppSidebar renderiza botón «Cambiar contraseña» para ADMIN, SUBDIRECCION y REGISTRADOR', () => {
  const roles = ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR'];
  for (const rol of roles) {
    const session = {
      user: {
        id: '1',
        nombre: 'Usuario',
        apellidos: 'Prueba',
        username: 'usr_test',
        rol,
      },
    };
    const html = renderToStaticMarkup(
      h(MemoryRouter, null,
        h(Auth.Provider, { value: { session, signOut: async () => {} } },
          h(Sidebar, null),
        ),
      ),
    );
    assert.match(html, />Cambiar contraseña</, `Debe mostrar botón Cambiar contraseña para ${rol}`);
    assert.match(html, />Cerrar sesión</, `Debe mostrar botón Cerrar sesión para ${rol}`);
  }
});
