import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';

let vite, http, api, location;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  const root = '/src/features/organizacion-escolar/secciones/';
  api = await vite.ssrLoadModule(`${root}secciones.api.ts`);
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
    assert.deepEqual(await api.getSectionManagementLevels(), allowed);
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
    await assert.rejects(api.getSectionManagementLevels());
    assert.equal(attempts, 3, 'sin reintentos automáticos');
  }
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
