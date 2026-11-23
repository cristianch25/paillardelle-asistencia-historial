import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

let vite, Home, Auth, day;
before(async () => {
  vite = await createServer({ plugins: [{ name: 'registrar-home-state-mocks', enforce: 'pre', load(id) {
    const path = id.replaceAll('\\', '/');
    if (path.endsWith('/inicio/useRegistrarDay.ts')) return `
      export const state = { date: '2026-11-23', data: null, loading: false, error: '', retry() {} };
      export function useRegistrarDay() { return state; }`;
    if (path.endsWith('/anios-escolares/useSchoolYears.ts')) return `
      export function useSchoolYears() { return { years: [], loading: false, error: '', retry() {} }; }`;
  } }], server: { middlewareMode: true, hmr: false, ws: false } });
  Home = (await vite.ssrLoadModule('/src/features/inicio/RegistrarHomePage.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  day = (await vite.ssrLoadModule('/src/features/inicio/useRegistrarDay.ts')).state;
});
after(async () => { await vite?.close(); });

function row(id, status = 'SIN_REGISTRO', options = {}) {
  const summary = status === 'SIN_REGISTRO' ? null : { total: 5, presentes: status === 'COMPLETA' ? 5 : status === 'VACIA' ? 0 : 2,
    tardanzas: 0, faltas: 0, pendientes: status === 'COMPLETA' ? 0 : status === 'VACIA' ? 5 : 3 };
  return { seccion: { id, anio_escolar_id: '1', nivel: 'PRIMARIA', grado: 1, letra: String.fromCharCode(64 + Number(id)), ...options.section },
    es_lectivo: options.lective ?? true, situacion: summary ? options.situation ?? 'ABIERTA' : 'SIN_REGISTRO',
    sesion_id: summary ? `10${id}` : null, resumen: summary };
}
function render(rows, cargo = 'DOCENTE', state = {}) {
  Object.assign(day, { data: rows, date: '2026-11-23', loading: false, error: '', ...state });
  return renderToStaticMarkup(h(MemoryRouter, null,
    h(Auth.Provider, { value: { session: { user: { id: '1', rol: 'REGISTRADOR', cargo } } } }, h(Home))));
}
const counts = html => [...html.matchAll(/<dd[^>]*>(\d+)<\/dd>/g)].map(match => Number(match[1]));
const pendingList = html => html.match(/<ul aria-label="Secciones pendientes"[^>]*>(.*?)<\/ul>/s)?.[1] ?? '';

test('una pendiente identifica nivel, grado y letra debajo de los contadores sin cambiar la fecha', () => {
  const html = render([row('1')]);
  assert.deepEqual(counts(html), [0, 1]);
  assert.match(pendingList(html), /Primaria · 1 A/); assert.match(pendingList(html), /Lista sin registrar/);
  assert.ok(html.indexOf('</dl>') < html.indexOf('aria-label="Secciones pendientes"'));
  assert.match(html, /23\/11\/2026/);
});

test('auxiliar con más de cinco pendientes ve todas las secciones en una lista de altura limitada', () => {
  const rows = Array.from({ length: 8 }, (_, i) => row(String(i + 1))), before = structuredClone(rows);
  const html = render(rows, 'AUXILIAR'), list = pendingList(html);
  assert.deepEqual(counts(html), [0, 8]);
  assert.equal([...list.matchAll(/<li\b/g)].length, 8);
  for (const entry of rows) assert.ok(list.includes(`Primaria · 1 ${entry.seccion.letra}`));
  assert.match(html, /max-h-64 overflow-y-auto/); assert.doesNotMatch(html, /secciones más/);
  assert.deepEqual(rows, before);
});

test('SIN_REGISTRO, sesión vacía, guardado parcial y sesión completa conservan sus diferencias', () => {
  const html = render([row('1'), row('2', 'VACIA'), row('3', 'PARCIAL', { situation: 'CERRADA' }), row('4', 'COMPLETA')]);
  const list = pendingList(html);
  assert.deepEqual(counts(html), [1, 3]);
  assert.equal((list.match(/Lista sin registrar/g) ?? []).length, 2);
  assert.equal((list.match(/Lista incompleta/g) ?? []).length, 1);
  assert.doesNotMatch(list, /Primaria · 1 D/);
});

test('todas completas: conserva confirmación breve y oculta la lista', () => {
  const html = render([row('1', 'COMPLETA'), row('2', 'COMPLETA', { situation: 'CERRADA' })]);
  assert.deepEqual(counts(html), [2, 0]); assert.equal(pendingList(html), '');
  assert.match(html, /Ya completaste la asistencia de todas tus secciones de hoy/);
});

test('día no lectivo no genera pendientes; un nivel no lectivo tampoco se incluye en un día mixto', () => {
  const nonLective = row('2', 'PARCIAL', { lective: false, section: { nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' } });
  const sunday = render([nonLective], 'AUXILIAR', { date: '2026-11-22' });
  assert.match(sunday, /22\/11\/2026|Fecha no lectiva/); assert.equal(pendingList(sunday), '');
  assert.deepEqual(counts(sunday), []);
  const mixed = render([row('1'), nonLective]);
  assert.deepEqual(counts(mixed), [0, 1]); assert.doesNotMatch(pendingList(mixed), /CREATIVOS/);
});

test('solo muestra las asignaciones recibidas; cambiar de docente a auxiliar no conserva secciones anteriores', () => {
  assert.match(pendingList(render([row('1')])), /Primaria · 1 A/);
  const html = render([row('2', 'PARCIAL', { section: { nivel: 'SECUNDARIA', grado: 3, letra: 'B' } })], 'AUXILIAR');
  assert.match(pendingList(html), /Secundaria · 3 B/); assert.doesNotMatch(pendingList(html), /Primaria · 1 A/);
  assert.deepEqual(counts(html), [0, 1]);
  assert.match(render([]), /No tienes secciones asignadas/);
  assert.equal(pendingList(render(null, 'DOCENTE', { loading: true })), '');
  assert.equal(pendingList(render(null, 'DOCENTE', { error: 'No se pudo consultar.' })), '');
});
