import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, api, Dialog, ProfileView, Auth;

const retiredProfile = {
  estudiante: {
    id: '9007199254740995',
    nombres: 'Ana',
    apellido_paterno: 'Pérez',
    apellido_materno: 'Gómez',
    codigo_estudiante: '001234',
  },
  contexto: {
    anio_escolar_id: '1',
    mes: '2026-06',
    fecha_desde: '2026-06-01',
    fecha_hasta: '2026-06-30',
    matricula_id: '9007199254740994',
    matricula_estado: 'RETIRADA',
    fecha_retiro: '2026-06-15',
    seccion_actual: null,
    secciones: [
      { id: '11', nivel: 'PRIMARIA', grado: 4, letra: 'A', fecha_inicio: '2026-03-01', fecha_fin: '2026-06-15' },
    ],
  },
  apoderado_visible: true,
  apoderado: null,
  resumen: {
    total: 0,
    presentes: 0,
    tardanzas: 0,
    faltas: 0,
    pendientes: 0,
    justificadas: 0,
    injustificadas: 0,
    faltas_justificadas: 0,
    tardanzas_justificadas: 0,
  },
  dias: [],
};

const activeProfile = {
  ...retiredProfile,
  contexto: {
    ...retiredProfile.contexto,
    matricula_estado: 'ACTIVA',
    fecha_retiro: null,
    seccion_actual: { id: '11', nivel: 'PRIMARIA', grado: 4, letra: 'A' },
  },
};

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/matriculas/matriculas.api.ts');
  Dialog = (await vite.ssrLoadModule('/src/features/matriculas/ReingresoDialog.tsx')).default;
  ProfileView = (await vite.ssrLoadModule('/src/features/estudiantes/perfil/StudentProfileView.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
});

after(async () => {
  await vite?.close();
});

test('API getRetiredStudents envía GET /secciones/:id/retirados', async () => {
  const http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  let capturedUrl = '';
  const originalGet = http.httpClient.get;
  http.httpClient.get = async url => {
    capturedUrl = url;
    return { data: { seccion_id: '11', retirados: [{ id: '99', estudiante_id: '10' }] } };
  };
  try {
    const list = await api.getRetiredStudents('11');
    assert.equal(capturedUrl, '/secciones/11/retirados');
    assert.equal(list.length, 1);
    assert.equal(list[0].id, '99');
  } finally {
    http.httpClient.get = originalGet;
  }
});

test('API reingresoStudent envía POST /matriculas/:id/reingreso con payload esperado', async () => {
  const http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  let capturedUrl = '', capturedBody = null;
  const originalPost = http.httpClient.post;
  http.httpClient.post = async (url, body) => {
    capturedUrl = url;
    capturedBody = body;
    return { data: { id: '123', estado: 'ACTIVA', seccion_id: '11', fecha_reingreso: '2026-08-11' } };
  };
  try {
    const res = await api.reingresoStudent('123', '11', '2026-08-11');
    assert.equal(capturedUrl, '/matriculas/123/reingreso');
    assert.deepEqual(capturedBody, { seccion_id: '11', fecha_reingreso: '2026-08-11' });
    assert.equal(res.estado, 'ACTIVA');
    assert.equal(res.fecha_reingreso, '2026-08-11');
  } finally {
    http.httpClient.post = originalPost;
  }
});

test('ReingresoDialog renderiza modal accesible con datos de estudiante y retiro anterior', () => {
  const html = renderToStaticMarkup(
    h(Dialog, {
      studentName: 'Pérez Gómez Ana',
      matriculaId: '9007199254740994',
      anioEscolarId: '1',
      nivel: 'PRIMARIA',
      grado: 4,
      fechaRetiro: '2026-06-15',
      onClose: () => {},
      onSuccess: () => {},
    }),
  );
  assert.match(html, /Reingresar estudiante/);
  assert.match(html, /Pérez Gómez Ana/);
  assert.match(html, /Fecha de retiro anterior:/);
  assert.match(html, /15\/06\/2026/);
  assert.match(html, /Cargando secciones disponibles/);
});

test('StudentProfileView muestra botón Reingresar estudiante si está RETIRADA y usuario es ADMIN/SUBDIRECCION', () => {
  // 1. ADMIN con perfil RETIRADA -> muestra banner y botón Reingresar estudiante
  const htmlAdminRetired = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'ADMIN' } } } },
      h(ProfileView, { data: retiredProfile }),
    ),
  );
  assert.match(htmlAdminRetired, /Estudiante con matrícula RETIRADA/);
  assert.match(htmlAdminRetired, />Reingresar estudiante</);

  // 2. ADMIN con perfil ACTIVA -> NO muestra botón Reingresar
  const htmlAdminActive = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'ADMIN' } } } },
      h(ProfileView, { data: activeProfile }),
    ),
  );
  assert.doesNotMatch(htmlAdminActive, />Reingresar estudiante</);

  // 3. REGISTRADOR con perfil RETIRADA -> NO muestra botón Reingresar
  const htmlRegistrador = renderToStaticMarkup(
    h(Auth.Provider, { value: { session: { user: { rol: 'REGISTRADOR' } } } },
      h(ProfileView, { data: retiredProfile }),
    ),
  );
  assert.doesNotMatch(htmlRegistrador, />Reingresar estudiante</);
});
