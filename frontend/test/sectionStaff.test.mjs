import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';

let vite, http, api, dates;
const assignment = (id, changes = {}) => ({ id: String(id), usuario_id: String(id), seccion_id: '2',
  fecha_inicio: '2026-03-02', fecha_fin: null, usuario: { nombres: 'Lucía', apellidos: 'Rojas Vega', cargo: null }, ...changes });
const response = (config, rows, hasMore = false) => ({ config, status: 200, headers: {}, data: {
  asignaciones: rows, pagination: { page: config.params.page, limit: 100, has_more: hasMore } } });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  api = await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/sectionStaff.api.ts');
  dates = await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/padronReferenceDate.ts');
});
after(async () => { await vite?.close(); });

test('fecha administrativa respeta límites inclusivos, años pasados/futuros y fecha civil de Lima', () => {
  const year = { fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18' };
  for (const [today, expected] of [['2025-11-15', year.fecha_inicio], ['2026-03-02', year.fecha_inicio],
    ['2026-11-15', '2026-11-15'], ['2026-12-18', year.fecha_fin], ['2027-11-15', year.fecha_fin]]) {
    assert.equal(dates.padronReferenceDate(year, today), expected);
  }
  for (const invalid of [{}, { fecha_inicio: '2026-02-30', fecha_fin: '2026-12-18' },
    { fecha_inicio: '2027-01-01', fecha_fin: '2026-01-01' }]) assert.equal(dates.padronReferenceDate(invalid), '');
});

test('personal recorre todas las páginas por sección/año y filtra vigencias inclusivas sin vigencia=VIGENTE', async () => {
  const calls = [];
  const first = [assignment('9007199254740993'), assignment(2, { fecha_fin: '2026-11-15' }),
    assignment(3, { fecha_fin: '2026-11-14' }), assignment(4, { fecha_inicio: '2026-11-16' })];
  http.defaults.adapter = async config => {
    calls.push(config);
    return response(config, config.params.page === 1 ? first : [assignment(5, { fecha_inicio: '2026-11-15' })], config.params.page === 1);
  };
  const rows = await api.getSectionStaff('2', '1', '2026-11-15', () => true);
  assert.deepEqual(rows.map(row => row.id), ['9007199254740993', '2', '5']);
  assert.equal(rows[0].usuario.cargo, null);
  assert.deepEqual(calls.map(c => [c.method, c.url, c.params]), [1, 2].map(page => ['get', '/asignaciones', {
    seccion_id: '2', anio_escolar_id: '1', page, limit: 100 }]));
});

test('cero asignaciones y ninguna efectiva son vacíos exitosos', async () => {
  for (const rows of [[], [assignment(1, { fecha_fin: '2026-03-02' })]]) {
    http.defaults.adapter = async config => response(config, rows);
    assert.deepEqual(await api.getSectionStaff('2', '1', '2026-11-15', () => true), []);
  }
});

test('errores intermedios, duplicados, otra sección, fechas o contrato inválidos rechazan resultados parciales', async () => {
  for (const invalid of ['network', 'duplicate', 'section', 'date', 'user', 'pagination', 'empty']) {
    http.defaults.adapter = async config => {
      if (config.params.page === 1) return response(config, [assignment(1)], true);
      if (invalid === 'network') throw new AxiosError('privado');
      if (invalid === 'empty') return response(config, [], true);
      const row = assignment(invalid === 'duplicate' ? 1 : 2, {
        ...(invalid === 'section' ? { seccion_id: '3' } : {}),
        ...(invalid === 'date' ? { fecha_inicio: '2026-02-30' } : {}),
        ...(invalid === 'user' ? { usuario: undefined } : {}),
      });
      const result = response(config, [row]);
      if (invalid === 'pagination') result.data.pagination.page = 1;
      return result;
    };
    await assert.rejects(api.getSectionStaff('2', '1', '2026-11-15', () => true), undefined, invalid);
  }
});

test('invalidar carga durante respuesta tardía impide continuar páginas y publicar datos', async () => {
  let current = true, release, count = 0;
  http.defaults.adapter = config => { count++; return new Promise(resolve => { release = () => resolve(response(config, [assignment(1)], true)); }); };
  const pending = api.getSectionStaff('2', '1', '2026-11-15', () => current);
  await new Promise(resolve => setImmediate(resolve));
  current = false; release();
  assert.equal(await pending, null); assert.equal(count, 1);
});

test('límite de carga y 401 preservan error y tratamiento global de sesión', async () => {
  http.defaults.adapter = async config => response(config, [assignment(config.params.page)], true);
  await assert.rejects(api.getSectionStaff('2', '1', '2026-11-15', () => true), /límite/);
  const controller = new AbortController(), invalidated = [];
  const module = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  const disconnect = module.connectHttpSession({ current: () => ({ token: 'simulado', signal: controller.signal }),
    unauthorized: token => invalidated.push(token) });
  try {
    http.defaults.adapter = async config => {
      assert.equal(config.signal, controller.signal);
      throw new AxiosError('privado', '', config, undefined, { status: 401, config });
    };
    await assert.rejects(api.getSectionStaff('2', '1', '2026-11-15', () => true));
    assert.deepEqual(invalidated, ['simulado']);
  } finally { disconnect(); }
});
