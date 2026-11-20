import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, api, Dialog, List, Auth;

const currentSection = {
  id: '11',
  anio_escolar_id: '1',
  nivel: 'PRIMARIA',
  grado: 4,
  letra: 'A',
  turno: null,
  activo: true,
};

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
  Dialog = (await vite.ssrLoadModule('/src/features/matriculas/SectionChangeDialog.tsx')).default;
  List = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/EstudiantesList.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
});

after(async () => {
  await vite?.close();
});

test('API changeStudentSection envía POST /matriculas/:id/cambio-seccion con payload esperado', async () => {
  const http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  let capturedUrl = '', capturedBody = null;
  const originalPost = http.httpClient.post;
  http.httpClient.post = async (url, body) => {
    capturedUrl = url;
    capturedBody = body;
    return {
      data: {
        id: '123',
        estado: 'ACTIVA',
        seccion_anterior_id: '11',
        seccion_nueva_id: '14',
        fecha_efectiva: '2026-05-20',
      },
    };
  };
  try {
    const res = await api.changeStudentSection('123', '14', '2026-05-20');
    assert.equal(capturedUrl, '/matriculas/123/cambio-seccion');
    assert.deepEqual(capturedBody, { seccion_id: '14', fecha_efectiva: '2026-05-20' });
    assert.equal(res.estado, 'ACTIVA');
    assert.equal(res.seccion_nueva_id, '14');
  } finally {
    http.httpClient.post = originalPost;
  }
});

test('SectionChangeDialog renderiza modal accesible con datos de estudiante y sección actual', () => {
  const html = renderToStaticMarkup(
    h(Dialog, {
      entry: activeEntry,
      currentSection,
      onClose: () => {},
      onSuccess: () => {},
    }),
  );
  assert.match(html, /Cambiar sección de estudiante/);
  assert.match(html, /Pérez Gómez Ana/);
  assert.match(html, /Sección actual:/);
  assert.match(html, /4\.º A/);
});

test('EstudiantesList muestra botón Cambiar sección solo si está ACTIVA, usuario es ADMIN/SUBDIRECCION y hay sección', () => {
  // 1. ADMIN con matrícula activa y sección -> debe mostrar botón Cambiar sección y Retirar
  const htmlAdminActive = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'ADMIN' } } } },
      h(List, { entries: [activeEntry], section: currentSection }),
    ),
  );
  assert.match(htmlAdminActive, />Cambiar sección</);
  assert.match(htmlAdminActive, />Retirar</);

  // 2. ADMIN con matrícula ya RETIRADA -> no debe mostrar botón Cambiar sección
  const htmlAdminRetired = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'ADMIN' } } } },
      h(List, { entries: [retiredEntry], section: currentSection }),
    ),
  );
  assert.doesNotMatch(htmlAdminRetired, />Cambiar sección</);
  assert.doesNotMatch(htmlAdminRetired, />Retirar</);

  // 3. REGISTRADOR con matrícula activa -> no debe mostrar botón Cambiar sección
  const htmlRegistrador = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'REGISTRADOR' } } } },
      h(List, { entries: [activeEntry], section: currentSection }),
    ),
  );
  assert.doesNotMatch(htmlRegistrador, />Cambiar sección</);
  assert.doesNotMatch(htmlRegistrador, />Retirar</);
});
