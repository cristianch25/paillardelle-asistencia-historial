import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

let vite, api, AuditPage, Auth, navigationFor, presentation;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/auditoria/auditoria.api.ts');
  AuditPage = (await vite.ssrLoadModule('/src/features/auditoria/AuditPage.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  navigationFor = (await vite.ssrLoadModule('/src/app/layout/navigation.ts')).navigationFor;
  presentation = await vite.ssrLoadModule('/src/features/auditoria/auditPresentation.ts');
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
    const res = await api.getAuditLog({ page: 2, limit: 20, categoria: 'ESTUDIANTES_MATRICULAS' });
    assert.equal(capturedUrl, '/auditoria?page=2&limit=20&categoria=ESTUDIANTES_MATRICULAS');
    assert.deepEqual(res.registros, []);
    assert.equal(res.pagination.page, 2);

    await api.getAuditLog();
    assert.equal(capturedUrl, '/auditoria');

    for (const categoria of ['ASISTENCIAS', 'SECCIONES_ASIGNACIONES', 'ESTUDIANTES_MATRICULAS', 'CALENDARIO_ESCOLAR']) {
      await api.getAuditLog({ page: 2, limit: 20, categoria });
      assert.equal(capturedUrl, `/auditoria?page=2&limit=20&categoria=${categoria}`);
    }
  } finally {
    http.httpClient.get = originalGet;
  }
});

test('navigationFor incluye Historial de actividades exclusivamente para ADMIN', () => {
  assert.deepEqual(presentation.auditCategoryOptions.map(item => item.label), ['Todas las actividades', 'Asistencias', 'Secciones y asignaciones', 'Estudiantes y matrículas', 'Calendario escolar']);
  const adminNav = navigationFor('ADMIN');
  const auditItem = adminNav.find(item => item.path === '/auditoria');
  assert.ok(auditItem, 'ADMIN debe tener acceso a /auditoria en el menú');
  assert.equal(auditItem.label, 'Historial de actividades');

  const subNav = navigationFor('SUBDIRECCION');
  assert.equal(subNav.find(item => item.path === '/auditoria'), undefined, 'SUBDIRECCION no debe ver /auditoria');

  const regNav = navigationFor('REGISTRADOR');
  assert.equal(regNav.find(item => item.path === '/auditoria'), undefined, 'REGISTRADOR no debe ver /auditoria');
  assert.equal(navigationFor('SUPERUSUARIO').find(item => item.path === '/auditoria'), undefined);
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
  assert.match(html, /Historial de actividades/);
  assert.doesNotMatch(html, /Registro histórico de operaciones|Auditoría administrativa/);
  assert.match(html, /Filtrar por actividad/);
  assert.match(html, /Todas las actividades/);
  assert.equal((html.match(/<option /g) ?? []).length, 5);
  assert.match(html, /<option value="ASISTENCIAS">Asistencias<\/option>/);
  assert.doesNotMatch(html, /<option value="(?:CAMBIAR_PASSWORD|RESTABLECER_PASSWORD|CREAR_USUARIO)">/);
  assert.match(html, /Actualizar/);
  assert.match(html, /Cargando actividades/);
});

test('actividad legible para eventos actuales, alias históricos, SUPERUSUARIO y códigos desconocidos', () => {
  for (const [accion, expected] of Object.entries({ CREAR_SECCION: 'Sección creada', CREAR_EXCEPCION_LECTIVA: 'Excepción del calendario creada',
    CREAR_SUPERUSUARIO_LOCAL: 'Cuenta de superusuario creada', CAMBIAR_PASSWORD: 'Contraseña cambiada',
    ABRIR_SESION: 'Sesión de asistencia creada', MATRICULAR_ESTUDIANTE: 'Estudiante matriculado', CREAR_APODERADO_IMPORTACION: 'Apoderado registrado por importación' })) {
    assert.equal(presentation.activityName({ accion, accion_nombre: accion }), expected);
  }
  assert.equal(presentation.activityName({ accion: 'ACTIVIDAD_NUEVA', accion_nombre: '' }), 'Actividad nueva');
  assert.equal(presentation.activityName({ accion: 'NUEVA', accion_nombre: 'Nueva actividad escolar' }), 'Nueva actividad escolar');
});

test('identidad real, herramientas locales y datos incompletos no se atribuyen al usuario consultante', () => {
  const user = { id: '123', nombre_completo: 'María Elena Ficticia', usuario: 'demo', rol: 'SUBDIRECCION' };
  assert.equal(presentation.responsibleName(user), 'María Elena Ficticia');
  assert.equal(presentation.responsibleRole(user.rol), 'Subdirección');
  assert.equal(presentation.responsibleRole('SUPERUSUARIO'), 'Superusuario');
  assert.equal(presentation.responsibleName({ ...user, nombre_completo: 'Herramienta local de inicialización', rol: '' }), 'Herramienta local de inicialización');
  assert.equal(presentation.responsibleName({ ...user, nombre_completo: 'Desconocido' }), 'Cuenta sin nombre disponible');
  assert.equal(presentation.responsibleName({ ...user, nombre_completo: '', usuario: '' }), 'Responsable no disponible');
});

test('descripciones conservan nombres disponibles y el registro original completo, sin IDs ni tablas visibles', () => {
  const calendarText = 'Inicial · 25/11/2026 · No lectivo · Suspensión #12';
  assert.equal(presentation.activityDetail({ accion: 'CREAR_EXCEPCION_LECTIVA', entidad: 'calendario_lectivo', descripcion: calendarText }), calendarText);
  const record = { accion: 'CREAR_USUARIO', accion_nombre: 'Crear usuario', entidad: 'usuarios', registro_id: '55',
    descripcion: 'Creación de cuenta para María Ficticia (@demo) · ADMIN.' };
  const original = structuredClone(record);
  assert.equal(presentation.activityDetail(record), 'Creación de cuenta para María Ficticia · Administración.');
  assert.deepEqual(record, original);
  assert.equal(presentation.activityDetail({ ...record, accion: 'CREAR_SECCION', descripcion: 'Creación de sección académica #55.' }), 'Sección creada.');
  assert.equal(presentation.activityDetail({ ...record, accion: 'CREAR_EXCEPCION_LECTIVA', descripcion: 'Crear excepcion lectiva en calendario_lectivo #55.' }), 'Excepción del calendario creada.');
  assert.equal(presentation.activityDetail({ ...record, accion: 'CREAR_SUPERUSUARIO_LOCAL' }), 'Cuenta creada mediante la herramienta local de inicialización.');
  assert.equal(presentation.activityDetail({ ...record, accion: 'NUEVA', descripcion: 'Actividad escolar registrada por el sistema.' }), 'Actividad escolar registrada por el sistema.');
});
