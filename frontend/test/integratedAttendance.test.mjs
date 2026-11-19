import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router';
import { searchRows } from './support/globalStudentSearchFixture.mjs';
import { supervisionDetail } from './support/supervisionDetailFixture.mjs';

let vite, Auth, Page, Workspace, navigation, Profile, Management, Filters, levelsFor;
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
    [['/inicio', 'Inicio'], ['/secciones', 'Mis secciones'], ['/asistencias', 'Asistencias']]);
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
