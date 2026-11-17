import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, http, api, queries, Filter, location;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  const root = '/src/features/organizacion-escolar/secciones/';
  api = await vite.ssrLoadModule(`${root}sectionLevels.api.ts`);
  queries = await vite.ssrLoadModule(`${root}useSectionLevels.ts`);
  Filter = (await vite.ssrLoadModule(`${root}SeccionesFilters.tsx`)).default;
  location = await vite.ssrLoadModule(`${root}useSectionListLocation.ts`);
});
after(async () => { await vite?.close(); });
const response = config => ({ config, status: 200, statusText: 'OK', headers: {},
  data: { secciones: [], pagination: { page: 1, limit: 1, has_more: false } } });

test('niveles efectivos: 200 vacío confirma acceso; 403 lo excluye, incluyendo supervisión adicional', async () => {
  for (const allowed of [['INICIAL', 'PRIMARIA'], ['SECUNDARIA']]) {
    const calls = [];
    http.defaults.adapter = async config => {
      calls.push(config.params.nivel);
      assert.equal(config.url, '/secciones/'); assert.equal(config.method, 'get');
      assert.deepEqual(Object.keys(config.params).sort(), ['limit', 'nivel', 'page']);
      assert.equal(config.params.limit, 1);
      if (!allowed.includes(config.params.nivel)) throw new AxiosError('403', 'ERR_BAD_REQUEST', config, undefined, { status: 403, config });
      return response(config);
    };
    assert.deepEqual(await api.getAuthorizedSectionLevels(), allowed);
    assert.deepEqual(calls, ['INICIAL', 'PRIMARIA', 'SECUNDARIA']);
  }
});

test('errores de red, servidor o sesión no se convierten en autorización ni denegación definitiva', async () => {
  for (const status of [undefined, 500, 401]) {
    let attempts = 0;
    http.defaults.adapter = async config => {
      attempts++;
      if (config.params.nivel !== 'INICIAL') return response(config);
      throw new AxiosError('fallo', 'ERR_BAD_REQUEST', config, undefined, status ? { status, config } : undefined);
    };
    await assert.rejects(api.getAuthorizedSectionLevels());
    assert.equal(attempts, 3, 'sin reintentos automáticos');
  }
});

test('respuesta obsoleta de niveles no sustituye la consulta vigente', async () => {
  const pending = [], values = [];
  http.defaults.adapter = config => new Promise(resolve => pending.push(() => resolve(response(config))));
  const cancel = queries.observeSectionLevels(value => values.push(value));
  await setImmediate(); cancel();
  queries.observeSectionLevels(value => values.push(value));
  await setImmediate();
  for (const resolve of pending.slice(3)) resolve();
  await setImmediate();
  for (const resolve of pending.slice(0, 3)) resolve();
  await setImmediate();
  assert.equal(values.length, 1);
  assert.deepEqual(values[0].data, ['INICIAL', 'PRIMARIA', 'SECUNDARIA']);
});

function renderFilters(levels, nivel) {
  return renderToStaticMarkup(createElement(Filter, { years: [], yearId: '1', levels,
    allLevelsLabel: 'Todos mis niveles', filters: { nivel, grado: '', activo: '' }, onYearChange() {}, onFiltersChange() {} }));
}
test('un nivel se presenta fijo; varios ofrecen solo confirmados y Todos mis niveles', () => {
  const fixed = renderFilters(['SECUNDARIA'], 'SECUNDARIA');
  assert.match(fixed, />Secundaria<\/p>/);
  assert.doesNotMatch(fixed, /value="INICIAL"|value="PRIMARIA"|Todos mis niveles|id="[^"]*-level"/);
  const multiple = renderFilters(['INICIAL', 'PRIMARIA'], '');
  assert.match(multiple, /Todos mis niveles/);
  assert.match(multiple, /value="INICIAL"/); assert.match(multiple, /value="PRIMARIA"/);
  assert.doesNotMatch(multiple, /value="SECUNDARIA"/);
});

test('normalización conserva filtros válidos y página; invalida nivel o grado retirados', () => {
  const valid = { nivel: 'INICIAL', grado: '4', activo: 'false' };
  assert.deepEqual(location.normalizeSectionFilters(valid, ['INICIAL', 'PRIMARIA']), { filters: valid, resetPage: false });
  assert.deepEqual(location.normalizeSectionFilters({ nivel: '', grado: '5', activo: 'false' }, ['SECUNDARIA']), {
    filters: { nivel: 'SECUNDARIA', grado: '5', activo: 'false' }, resetPage: false,
  });
  assert.deepEqual(location.normalizeSectionFilters({ nivel: 'PRIMARIA', grado: '6', activo: 'true' }, ['SECUNDARIA']), {
    filters: { nivel: 'SECUNDARIA', grado: '', activo: 'true' }, resetPage: true,
  });
});

test('Todos mis niveles elimina grado/edad sin reinterpretar los valores de API', () => {
  const mixed = location.normalizeSectionFilters({ nivel: '', grado: '4', activo: 'false' }, ['INICIAL', 'PRIMARIA']);
  assert.deepEqual(mixed, { filters: { nivel: '', grado: '', activo: 'false' }, resetPage: true });
  const html = renderFilters(['INICIAL', 'PRIMARIA'], '');
  const grade = html.match(/<select[^>]*id="[^"]*-grade"[^>]*>[\s\S]*?<\/select>/)[0];
  assert.match(grade, / disabled=""/);
  assert.equal((grade.match(/<option/g) ?? []).length, 1);
});

test('cambiar de edad a grado limpia 4; cambiar entre grados conserva los válidos', () => {
  const initial = { nivel: 'INICIAL', grado: '4', activo: 'true' };
  assert.deepEqual(location.sectionFiltersForLevel(initial, 'PRIMARIA'), { ...initial, nivel: 'PRIMARIA', grado: '' });
  const primary = { nivel: 'PRIMARIA', grado: '4', activo: 'false' };
  assert.deepEqual(location.sectionFiltersForLevel(primary, 'INICIAL'), { ...primary, nivel: 'INICIAL', grado: '' });
  assert.deepEqual(location.sectionFiltersForLevel(primary, 'SECUNDARIA'), { ...primary, nivel: 'SECUNDARIA' });
  assert.equal(location.sectionFiltersForLevel({ ...primary, grado: '6' }, 'SECUNDARIA').grado, '');
  assert.equal(location.sectionFiltersForLevel(primary, '').grado, '');
});
