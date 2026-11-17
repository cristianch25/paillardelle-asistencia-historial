import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router';
import { searchRows } from './support/globalStudentSearchFixture.mjs';
import { supervisionDetail } from './support/supervisionDetailFixture.mjs';

let vite, Auth, Page, Workspace, navigation, Profile, Management;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
  Page = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionPage.tsx')).default;
  Workspace = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionWorkspace.tsx')).default;
  Profile = (await vite.ssrLoadModule('/src/features/asistencias/integrada/StudentAttendanceProfile.tsx')).default;
  Management = (await vite.ssrLoadModule('/src/features/asistencias/gestion/AttendanceManagementPage.tsx')).default;
});
after(async () => { await vite?.close(); });
const session = rol => ({ user: { id: '1', rol, nivel_asignado: 'PRIMARIA' }, expiresAt: 10 });
function render(Component, role = 'ADMIN') {
  return renderToStaticMarkup(h(MemoryRouter, null, h(Auth.Provider, { value: { session: session(role) } },
    h(Routes, null, h(Route, { element: h(Workspace) }, h(Route, { path: '/', element: h(Component) }))))));
}
test('ADMIN tiene una entrada principal; SUBDIRECCION conserva ambas y REGISTRADOR ninguna', () => {
  assert.deepEqual(navigation.navigationFor('ADMIN').filter(item => item.path.startsWith('/asistencias'))
    .map(item => [item.path, item.label]), [['/asistencias/supervision', 'Asistencias']]);
  assert.equal(navigation.navigationFor('SUBDIRECCION').filter(item => item.path.startsWith('/asistencias')).length, 2);
  assert.equal(navigation.navigationFor('REGISTRADOR').filter(item => item.path.startsWith('/asistencias')).length, 0);
});
test('composición unificada solo ADMIN; consulta y Gestión separadas para SUBDIRECCION', () => {
  assert.match(render(Page), />Asistencias</); assert.match(render(Page), /Buscar estudiante/);
  assert.match(render(Page, 'SUBDIRECCION'), /Supervisión de asistencias/);
  assert.doesNotMatch(render(Page, 'SUBDIRECCION'), /Buscar estudiante/);
  assert.doesNotMatch(render(Management), /Gestión de asistencias/);
  assert.match(render(Management, 'SUBDIRECCION'), /Gestión de asistencias/);
  assert.doesNotMatch(render(Page, 'REGISTRADOR'), /Buscar estudiante/);
});
test('perfil sin asistencia ofrece solo contexto real de la fecha, sin historial ni apertura ficticios', () => {
  const rows = searchRows(supervisionDetail(), '2026-11-15', 'INICIAL', true);
  const html = renderToStaticMarkup(h(Auth.Provider, { value: { session: session('ADMIN') } },
    h(Profile, { row: rows[0], onBack() {}, onReload() {} })));
  assert.match(html, /Perfil del estudiante/); assert.match(html, /Asistencia del 15\/11\/2026/);
  assert.match(html, /historial individual completo todavía no está disponible/);
  assert.doesNotMatch(html, /Guardar cambios|Abrir asistencia|historial_asistencias|usuario_id/);
});
