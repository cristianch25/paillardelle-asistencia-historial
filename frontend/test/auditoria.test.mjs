import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

let vite, api, AuditPage, Auth, navigationFor;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/auditoria/auditoria.api.ts');
  AuditPage = (await vite.ssrLoadModule('/src/features/auditoria/AuditPage.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  navigationFor = (await vite.ssrLoadModule('/src/app/layout/navigation.ts')).navigationFor;
});

after(async () => {
  await vite?.close();
});

test('API getAuditLog envía GET /auditoria con query params serializados', async () => {
  const http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  let capturedUrl = '';
  const originalGet = http.httpClient.get;
  http.httpClient.get = async url => {
    capturedUrl = url;
    return { data: { registros: [], pagination: { page: 2, limit: 20, has_more: false } } };
  };
  try {
    const res = await api.getAuditLog({ page: 2, limit: 20, accion: 'RETIRAR_MATRICULA' });
    assert.equal(capturedUrl, '/auditoria?page=2&limit=20&accion=RETIRAR_MATRICULA');
    assert.deepEqual(res.registros, []);
    assert.equal(res.pagination.page, 2);

    await api.getAuditLog();
    assert.equal(capturedUrl, '/auditoria');

    for (const accion of ['ABRIR_SESION_ASISTENCIA', 'CERRAR_SESION_ASISTENCIA']) {
      await api.getAuditLog({ page: 2, limit: 20, accion });
      assert.equal(capturedUrl, `/auditoria?page=2&limit=20&accion=${accion}`);
    }
  } finally {
    http.httpClient.get = originalGet;
  }
});

test('navigationFor incluye opción Auditoría exclusivamente para ADMIN', () => {
  const adminNav = navigationFor('ADMIN');
  const auditItem = adminNav.find(item => item.path === '/auditoria');
  assert.ok(auditItem, 'ADMIN debe tener acceso a /auditoria en el menú');
  assert.equal(auditItem.label, 'Auditoría');

  const subNav = navigationFor('SUBDIRECCION');
  assert.equal(subNav.find(item => item.path === '/auditoria'), undefined, 'SUBDIRECCION no debe ver /auditoria');

  const regNav = navigationFor('REGISTRADOR');
  assert.equal(regNav.find(item => item.path === '/auditoria'), undefined, 'REGISTRADOR no debe ver /auditoria');
});

test('AuditPage renderiza estructura de encabezado, filtro y estados para ADMIN', () => {
  const session = {
    user: {
      id: '1',
      nombre: 'Administrador',
      apellidos: 'Principal',
      username: 'admin',
      rol: 'ADMIN',
    },
  };
  const html = renderToStaticMarkup(
    h(MemoryRouter, null,
      h(Auth.Provider, { value: { session } },
        h(AuditPage),
      ),
    ),
  );
  assert.match(html, /Auditoría administrativa/);
  assert.match(html, /Tipo de operación:/);
  assert.match(html, /Todas las operaciones/);
  assert.match(html, /<option value="ABRIR_SESION_ASISTENCIA">Creación de sesión de asistencia<\/option>/);
  assert.match(html, /<option value="CERRAR_SESION_ASISTENCIA">Cierre de sesión de asistencia<\/option>/);
  assert.doesNotMatch(html, /<option value="(?:ABRIR_SESION|CERRAR_SESION)">/);
  assert.match(html, /Actualizar/);
  assert.match(html, /Cargando registros de auditoría/);
});
