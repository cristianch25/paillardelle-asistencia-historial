import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, api, Dialog, List, Auth;

const activeEntry = {
  id: '9007199254740994',
  estudiante_id: '9007199254740995',
  anio_escolar_id: '1',
  fecha_ingreso: '2026-03-01',
  fecha_retiro: null,
  estado: 'ACTIVA',
  matricula_seccion_id: '9007199254740996',
  seccion_id: '11',
  fecha_inicio: '2026-03-01',
  fecha_fin: null,
  estudiante: {
    id: '9007199254740995',
    apellido_paterno: 'Pérez',
    apellido_materno: 'Gómez',
    nombres: 'Ana',
    codigo_estudiante: '001234',
    fecha_nacimiento: null,
    tipo_documento: null,
    numero_documento: null,
    created_at: '2026-03-01',
    updated_at: '2026-03-01',
  },
};

const retiredEntry = {
  ...activeEntry,
  id: '9007199254740997',
  estado: 'RETIRADA',
  fecha_retiro: '2026-06-15',
};

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/matriculas/matriculas.api.ts');
  Dialog = (await vite.ssrLoadModule('/src/features/matriculas/EnrollmentWithdrawDialog.tsx')).default;
  List = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/EstudiantesList.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
});

after(async () => {
  await vite?.close();
});

test('API withdrawEnrollment envía PATCH /matriculas/:id/retiro con payload esperado', async () => {
  const http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  let capturedUrl = '', capturedBody = null;
  const originalPatch = http.httpClient.patch;
  http.httpClient.patch = async (url, body) => {
    capturedUrl = url;
    capturedBody = body;
    return { data: { id: '123', estado: 'RETIRADA', fecha_retiro: '2026-06-15' } };
  };
  try {
    const res = await api.withdrawEnrollment('123', '2026-06-15', null);
    assert.equal(capturedUrl, '/matriculas/123/retiro');
    assert.deepEqual(capturedBody, { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null });
    assert.equal(res.estado, 'RETIRADA');
  } finally {
    http.httpClient.patch = originalPatch;
  }
});

test('EnrollmentWithdrawDialog muestra estudiante, fechas y mensaje explicativo claro', () => {
  const html = renderToStaticMarkup(
    h(Dialog, {
      entry: activeEntry,
      onClose: () => {},
      onSuccess: () => {},
    }),
  );
  assert.match(html, /Retirar estudiante/);
  assert.match(html, /Pérez Gómez Ana/);
  assert.match(html, /Código: 001234/);
  assert.match(html, /Último día en el padrón \(inclusive\)/);
  assert.match(html, /El estudiante pertenecerá al padrón hasta el/);
  assert.match(html, /ya no aparecerá en las listas de asistencia posteriores/);
  assert.match(html, /Confirmar retiro/);
  assert.match(html, /Cancelar/);
});

test('EstudiantesList muestra botón Retirar solo si está ACTIVA y usuario es ADMIN/SUBDIRECCION', () => {
  // 1. ADMIN con matrícula activa -> debe mostrar botón Retirar
  const htmlAdminActive = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'ADMIN' } } } },
      h(List, { entries: [activeEntry] }),
    ),
  );
  assert.match(htmlAdminActive, />Retirar</);

  // 2. ADMIN con matrícula ya RETIRADA -> no debe mostrar botón Retirar
  const htmlAdminRetired = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'ADMIN' } } } },
      h(List, { entries: [retiredEntry] }),
    ),
  );
  assert.doesNotMatch(htmlAdminRetired, />Retirar</);

  // 3. REGISTRADOR con matrícula activa -> no debe mostrar botón Retirar
  const htmlRegistrador = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'REGISTRADOR' } } } },
      h(List, { entries: [activeEntry] }),
    ),
  );
  assert.doesNotMatch(htmlRegistrador, />Retirar</);
});
