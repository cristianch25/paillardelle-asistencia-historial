import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionCatalog, catalogResponse, catalogYear } from './support/sectionSearchFixture.mjs';

let vite, search, api, http, presentation, List;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  const root = '/src/features/organizacion-escolar/secciones/';
  search = await vite.ssrLoadModule(`${root}sectionSearch.ts`);
  api = await vite.ssrLoadModule(`${root}sectionSearch.api.ts`);
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  presentation = await vite.ssrLoadModule(`${root}sectionPresentation.ts`);
  List = (await vite.ssrLoadModule(`${root}SeccionesList.tsx`)).default;
});
after(async () => { await vite?.close(); });

test('1A/1 A/1°A/1.º A son equivalentes, combinables con nivel y sin confundir letras ni grados', () => {
  const rows = sectionCatalog();
  for (const query of ['1A', '1 A', '1°A', '1.º A', '  1 º A  ']) {
    assert.deepEqual(search.searchSections(rows, query).map(row => row.id), [rows[0].id, rows[1].id]);
  }
  assert.deepEqual(search.searchSections(rows, 'PRIMÁRIA 1a'), [rows[0]]);
  assert.deepEqual(search.searchSections(rows, 'secundaria 1 a'), [rows[1]]);
  assert.deepEqual(search.searchSections([rows[0], { ...rows[0], grado: 11 }], '1a'), [rows[0]]);
  assert.deepEqual(search.searchSections([rows[0]], '11a'), []);
});

test('Inicial conserva nombres reales y admite fragmentos/edad; vacío conserva todo, incluidas inactivas', () => {
  const rows = sectionCatalog();
  assert.deepEqual(search.searchSections(rows, 'creativ'), [rows[2]]);
  assert.deepEqual(search.searchSections(rows, 'inicial 4 años creativos'), [rows[2]]);
  assert.deepEqual(search.searchSections(rows, 'geniales'), [rows[3]]);
  assert.deepEqual(search.searchSections(rows, 'primaria 5e'), [rows[150]]);
  assert.equal(search.searchSections(rows, '   ').length, 230);
  const before = structuredClone(rows); search.searchSections(rows, '1a'); assert.deepEqual(rows, before);
});

test('formato administrativo opcional no altera el predeterminado ni valores/acciones', () => {
  const rows = sectionCatalog().slice(0, 4);
  assert.equal(presentation.formatAdministrativeSectionName(rows[0]), '1 A');
  assert.equal(presentation.formatAdministrativeSectionName(rows[1]), '1 A');
  assert.equal(presentation.formatSectionName(rows[0]), '1.º A');
  assert.equal(presentation.formatAdministrativeSectionName(rows[2]), '4 años · CREATIVOS');
  assert.equal(presentation.formatAdministrativeSectionName(rows[3]), '5 años · GENIALES');
  const html = renderToStaticMarkup(h(List, { sections: rows, years: [catalogYear], checking: false, onOpen() {},
    formatName: presentation.formatAdministrativeSectionName, showAttendance: false }));
  assert.equal((html.match(/>1 A<\/h2>/g) ?? []).length, 2);
  assert.ok(html.includes('Primaria') && html.includes('Secundaria') && html.includes('Inactiva'));
  assert.doesNotMatch(html, /Sección seleccionada|Seleccionar|\.º/);
  assert.doesNotMatch(html, /Asistencia diaria/);
  assert.equal((html.match(/>Ver estudiantes<\/button>/g) ?? []).length, 4);
  assert.equal((html.match(/bg-institutional-800/g) ?? []).length, 4);
});

test('catálogo 230: solo GET año/page/limit=100, tres páginas secuenciales; descubre secciones fuera de la primera', async () => {
  const calls = []; let active = false;
  http.defaults.adapter = async config => {
    assert.equal(active, false); active = true;
    assert.equal(config.method, 'get'); assert.equal(config.url, '/secciones/');
    assert.deepEqual(config.params, { anio_escolar_id: '1', page: calls.length + 1, limit: 100 });
    calls.push(config); await Promise.resolve(); active = false; return catalogResponse(config);
  };
  const rows = await api.getSectionSearchCatalog('1', () => true);
  assert.equal(rows.length, 230); assert.equal(calls.length, 3);
  assert.equal(search.searchSections(rows, 'primaria 5e')[0].id, sectionCatalog()[150].id);
});

test('vacío es definitivo; fallo intermedio rechaza todo sin reintentos ni entrega parcial', async () => {
  let calls = 0;
  http.defaults.adapter = async config => { calls++; return catalogResponse(config, []); };
  assert.deepEqual(await api.getSectionSearchCatalog('1', () => true), []); assert.equal(calls, 1);
  calls = 0;
  http.defaults.adapter = async config => { calls++; if (calls === 2) throw new Error('red'); return catalogResponse(config); };
  await assert.rejects(api.getSectionSearchCatalog('1', () => true), /red/); assert.equal(calls, 2);
});

test('carga obsoleta se detiene antes de pedir páginas restantes', async () => {
  let calls = 0, current = false;
  http.defaults.adapter = async config => { calls++; current = false; return catalogResponse(config); };
  assert.equal(await api.getSectionSearchCatalog('1', () => current), null); assert.equal(calls, 0);
  current = true; assert.equal(await api.getSectionSearchCatalog('1', () => current), null); assert.equal(calls, 1);
});

test('rechaza paginación errónea, duplicados, otro año, falta de progreso y más de 100 páginas', async () => {
  for (const scenario of ['page', 'duplicate', 'year', 'empty', 'limit']) {
    let calls = 0;
    http.defaults.adapter = async config => {
      calls++; const result = catalogResponse(config, sectionCatalog(scenario === 'limit' ? 10001 : 230));
      if (scenario === 'page') result.data.pagination.page = 1;
      if (scenario === 'duplicate' && calls === 2) result.data.secciones[0].id = sectionCatalog()[0].id;
      if (scenario === 'year') result.data.secciones[0].anio_escolar_id = '2';
      if (scenario === 'empty') result.data.secciones = [];
      return result;
    };
    await assert.rejects(api.getSectionSearchCatalog('1', () => true));
    assert.equal(calls, scenario === 'limit' ? 100 : ['page', 'duplicate'].includes(scenario) ? 2 : 1);
  }
});
