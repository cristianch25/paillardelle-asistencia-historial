import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router';
import { searchRows } from './support/globalStudentSearchFixture.mjs';
import { supervisionDetail } from './support/supervisionDetailFixture.mjs';

let vite, Auth, Page, Workspace, navigation, Profile, Management, Filters, levelsFor, SessionView, SaveBar;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
  Page = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionPage.tsx')).default;
  Workspace = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionWorkspace.tsx')).default;
  Profile = (await vite.ssrLoadModule('/src/features/asistencias/integrada/StudentAttendanceProfile.tsx')).default;
  Management = (await vite.ssrLoadModule('/src/features/asistencias/gestion/AttendanceManagementPage.tsx')).default;
  Filters = (await vite.ssrLoadModule('/src/features/asistencias/integrada/AdminAttendanceFilters.tsx')).default;
  levelsFor = (await vite.ssrLoadModule('/src/features/asistencias/supervision/supervisionAccess.ts')).supervisionLevels;
  SessionView = (await vite.ssrLoadModule('/src/features/asistencias/AsistenciaSessionView.tsx')).default;
  SaveBar = (await vite.ssrLoadModule('/src/features/asistencias/AttendanceSaveBar.tsx')).default;
});

test('detalle administrativo destaca la búsqueda y conserva acciones y confirmaciones', () => {
  const html = renderToStaticMarkup(h(MemoryRouter, null, h(Auth.Provider, { value: { session: session('ADMIN') } }, h(SessionView, {
    data: supervisionDetail(), editable: true, administrativeDetail: true, pendingCount: 1,
  }))));
  assert.doesNotMatch(html, /Registro de asistencia/);
  assert.match(html, /lucide-search/);
  assert.match(html, /rounded-full/);
  assert.match(html, /Buscar estudiante/);
  assert.match(html, /Mostrando 5 de 5 estudiantes.*1 cambio sin guardar/);
  assert.doesNotMatch(html, /Las marcas se guardan solo|Si sales con cambios sin guardar/);
  assert.doesNotMatch(html, /Se aplica a los estudiantes sin marcar|No hay estudiantes sin marcar/);
  for (const label of ['Presente', 'Tardanza', 'Falta', 'Sin marcar', 'Historial']) assert.ok(html.includes(label), label);
});

test('barra del detalle oculta solo el aviso rutinario de acceso y conserva errores y conflictos', () => {
  const message = 'Acceso a la sesión comprobado. Las selecciones compatibles se conservan; revisa las diferencias si existen.';
  const bar = props => renderToStaticMarkup(h(SaveBar, { count: 1, phase: 'idle', message, success: false,
    disabled: false, conflicts: 0, onSave() {}, onRefresh() {}, administrativeDetail: true, ...props }));
  assert.doesNotMatch(bar(), /Acceso a la sesión comprobado/);
  assert.match(bar(), /1 cambio sin guardar/); assert.match(bar(), /Guardar cambios/);
  assert.match(bar({ conflicts: 1 }), /Acceso a la sesión comprobado.*Revisar diferencias \(1\)/);
  assert.match(bar({ validation: 'Revisa el motivo de justificación.' }), /role="alert".*Revisa el motivo/);
  assert.match(bar({ message: 'No se pudo comprobar el acceso.', phase: 'refresh-required' }), /No se pudo comprobar.*Consultar estado actual/);
  assert.match(bar({ message: 'Error al guardar.' }), /role="alert".*Error al guardar/);
  assert.match(bar({ message: 'Cambios guardados correctamente.', success: true }), /role="status".*Cambios guardados correctamente/);
  assert.match(bar({ administrativeDetail: false }), /Acceso a la sesión comprobado/);
});

test('búsqueda vacía conserva el aviso de cambios pendientes en el detalle administrativo', () => {
  const html = renderToStaticMarkup(h(SessionView, {
    data: supervisionDetail(), administrativeDetail: true, query: 'No existe',
  }));
  assert.match(html, /Mostrando 0 de 5 estudiantes/);
  assert.match(html, /No hay estudiantes que coincidan.*Los cambios pendientes se conservan/);
});

test('las opciones predeterminadas y la vista compacta de REGISTRADOR conservan su presentación', () => {
  const props = { data: supervisionDetail(), editable: true };
  const regular = renderToStaticMarkup(h(MemoryRouter, null, h(SessionView, props)));
  const compact = renderToStaticMarkup(h(SessionView, { ...props, compact: true }));
  assert.match(regular, /Registro de asistencia/);
  for (const html of [regular, compact]) {
    assert.match(html, /class="max-w-lg"/);
    assert.doesNotMatch(html, /lucide-search|rounded-full/);
    assert.match(html, /Mostrando 5 de 5 estudiantes/);
  }
  assert.doesNotMatch(compact, /Registro de asistencia|Ver perfil|Las marcas se guardan solo/);
  assert.equal(compact, renderToStaticMarkup(h(SessionView, { ...props, compact: true, administrativeDetail: true })));
});
after(async () => { await vite?.close(); });
const session = rol => ({ user: { id: '1', rol, nivel_asignado: 'PRIMARIA' }, expiresAt: 10 });
function render(Component, role = 'ADMIN') {
  return renderToStaticMarkup(h(MemoryRouter, null, h(Auth.Provider, { value: { session: session(role) } },
    h(Routes, null, h(Route, { element: h(Workspace) }, h(Route, { path: '/', element: h(Component) }))))));
}
test('ADMIN y SUBDIRECCION conservan Asistencias; REGISTRADOR tiene entrada propia', () => {
  assert.deepEqual(navigation.navigationFor('ADMIN').filter(item => item.path.startsWith('/asistencias'))
    .map(item => [item.path, item.label]), [['/asistencias/supervision', 'Asistencias']]);
  assert.deepEqual(navigation.navigationFor('SUBDIRECCION').filter(item => item.path.startsWith('/asistencias'))
    .map(item => [item.path, item.label]), [['/asistencias/supervision', 'Asistencias']]);
  assert.deepEqual(navigation.navigationFor('REGISTRADOR').map(item => [item.path, item.label]),
    [['/inicio', 'Inicio'], ['/secciones', 'Mis secciones'], ['/asistencias', 'Asistencias'], ['/reportes', 'Ficha mensual PDF']]);
});
test('composición unificada ADMIN/SUBDIRECCION y antigua Gestión redirigida, sin acceso REGISTRADOR', () => {
  assert.match(render(Page), />Asistencias</); assert.match(render(Page), /Buscar estudiante/);
  assert.match(render(Page, 'SUBDIRECCION'), />Asistencias</);
  assert.match(render(Page, 'SUBDIRECCION'), /Buscar estudiante/);
  assert.doesNotMatch(render(Management), /Gestión de asistencias/);
  assert.doesNotMatch(render(Management, 'SUBDIRECCION'), /Gestión de asistencias/);
  assert.doesNotMatch(render(Page, 'REGISTRADOR'), /Buscar estudiante/);
});
test('selector de nivel usa exclusivamente la matriz de asistencia, sin inferir turnos ni adicionales', () => {
  for (const principal of ['INICIAL', 'PRIMARIA', 'SECUNDARIA']) {
    const levels = levelsFor({ rol: 'SUBDIRECCION', nivel_asignado: principal });
    const html = renderToStaticMarkup(h(Filters, { years: [], levels, value: { anio_escolar_id: '', fecha: '2026-11-15', nivel: '', page: 1 }, onChange() {} }));
    for (const level of ['INICIAL', 'PRIMARIA', 'SECUNDARIA']) assert.equal(html.includes(`value="${level}"`), levels.includes(level));
  }
});
test('perfil sin asistencia ofrece solo contexto real de la fecha, sin historial ni apertura ficticios', () => {
  const rows = searchRows(supervisionDetail(), '2026-11-15', 'INICIAL', true);
  const html = renderToStaticMarkup(h(Auth.Provider, { value: { session: session('ADMIN') } },
    h(Profile, { row: rows[0], onBack() {}, onReload() {} })));
  assert.match(html, /Perfil del estudiante/); assert.match(html, /Asistencia del 15\/11\/2026/);
  assert.match(html, /historial individual completo todavía no está disponible/);
  assert.doesNotMatch(html, /Guardar cambios|Abrir asistencia|historial_asistencias|usuario_id/);
});
