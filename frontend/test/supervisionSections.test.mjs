import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { supervisionResult, year } from './support/supervisionFixture.mjs';

let vite, http, api;
const scope = { anio_escolar_id: year.id, fecha: '2026-11-15', nivel: 'INICIAL' };
function response(config, total = 230) {
  const data = supervisionResult(config.params), start = (config.params.page - 1) * 100;
  data.secciones = Array.from({ length: Math.min(100, Math.max(0, total - start)) }, (_, index) => ({
    ...data.secciones[0], seccion: { ...data.secciones[0].seccion, id: String(9007199254740995n + BigInt(start + index)) },
  }));
  data.pagination.has_more = start + 100 < total;
  return { config, data, status: 200, statusText: 'OK', headers: {} };
}
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  api = await vite.ssrLoadModule('/src/features/asistencias/supervision/supervision.api.ts');
});
after(async () => { await vite?.close(); });

test('230 opciones: tres GET secuenciales, limit 100, ámbito exacto y sin sección/página del listado', async () => {
  const pages = []; let inFlight = false;
  http.httpClient.defaults.adapter = async config => {
    assert.equal(inFlight, false); inFlight = true;
    assert.equal(config.method, 'get'); assert.equal(config.url, '/asistencias/sesiones');
    assert.deepEqual(config.params, { ...scope, page: pages.length + 1, limit: 100 });
    pages.push(config.params.page); await Promise.resolve(); inFlight = false;
    return response(config);
  };
  const sections = await api.getSupervisionSections(scope, () => true);
  assert.equal(sections.length, 230); assert.equal(new Set(sections.map(section => section.id)).size, 230);
  assert.equal(sections[229].id, '9007199254741224'); assert.deepEqual(pages, [1, 2, 3]);
});

test('vacío es un conjunto completo sin solicitudes adicionales', async () => {
  let count = 0;
  http.httpClient.defaults.adapter = async config => { count++; return response(config, 0); };
  assert.deepEqual(await api.getSupervisionSections(scope, () => true), []); assert.equal(count, 1);
});

test('fallo en página 2 rechaza sin entregar opciones parciales ni reintentar', async () => {
  let count = 0;
  http.httpClient.defaults.adapter = async config => {
    count++; if (count === 2) throw new Error('red'); return response(config);
  };
  await assert.rejects(api.getSupervisionSections(scope, () => true), /red/); assert.equal(count, 2);
});

test('invalidar antes o durante una respuesta detiene el recorrido sin publicar opciones', async () => {
  let count = 0, current = false;
  http.httpClient.defaults.adapter = async config => { count++; current = false; return response(config); };
  assert.equal(await api.getSupervisionSections(scope, () => current), null); assert.equal(count, 0);
  current = true;
  assert.equal(await api.getSupervisionSections(scope, () => current), null); assert.equal(count, 1);
});

test('página incorrecta, sin progreso, repetida o sin fin falla de forma acotada', async () => {
  for (const scenario of ['page', 'empty', 'duplicate', 'endless']) {
    let count = 0;
    http.httpClient.defaults.adapter = async config => {
      count++; const result = response(config, scenario === 'endless' ? 10001 : 230);
      if (scenario === 'page') result.data.pagination.page = 1;
      if (scenario === 'empty') result.data.secciones = [];
      if (scenario === 'duplicate' && count > 1) result.data.secciones[0].seccion.id = '9007199254740995';
      return result;
    };
    await assert.rejects(api.getSupervisionSections(scope, () => true));
    assert.equal(count, scenario === 'endless' ? 100 : scenario === 'empty' ? 1 : 2);
  }
});
