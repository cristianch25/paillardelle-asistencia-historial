import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { dailyRows, dailyYear } from './support/adminHomeFixture.mjs';

let vite, api, client, navigation;
const date = '2026-11-17';
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/inicio/registrarDay.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
});
after(async () => { await vite?.close(); });
const response = (config, rows, has_more = false) => ({ config, status: 200, headers: {}, data: {
  anio_escolar_id: dailyYear.id, fecha: date, secciones: rows, pagination: { ...config.params, limit: 100, has_more } } });

test('resumen y tarjetas reutilizan el listado autorizado paginado, sin cuentas, historial ni estadísticas', async () => {
  const rows = dailyRows(105), calls = [];
  client.defaults.adapter = async config => {
    calls.push(config); const page = config.params.page;
    return response(config, rows.slice((page - 1) * 100, page * 100), page === 1);
  };
  const actual = await api.getRegistrarDay([dailyYear, { ...dailyYear, id: '2', fecha_inicio: '2099-01-01', fecha_fin: '2099-12-31' }], date, () => true);
  assert.deepEqual(actual, rows); assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === '/asistencias/sesiones' && call.method === 'get'));
  assert.deepEqual(calls.map(call => call.params.page), [1, 2]);
});

test('una sesión abierta o cerrada sin marcas no es asistencia registrada; pendientes son efectivos', () => {
  const row = dailyRows()[0];
  for (const situacion of ['ABIERTA', 'CERRADA']) {
    assert.equal(api.registrarDayStatus({ ...row, situacion, resumen: { total: 5, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 5 } }), 'Sin registro');
    assert.equal(api.registrarDayStatus({ ...row, situacion, resumen: { total: 5, presentes: 2, tardanzas: 1, faltas: 1, pendientes: 1 } }), 'Con pendientes');
    assert.equal(api.registrarDayStatus({ ...row, situacion, resumen: { total: 5, presentes: 3, tardanzas: 1, faltas: 1, pendientes: 0 } }), 'Registrada');
  }
  assert.equal(api.registrarDayStatus({ ...row, resumen: null }), 'Sin registro');
});

test('duplicados, conteos contradictorios y fallo intermedio no publican un resumen parcial', async () => {
  const row = dailyRows()[0];
  for (const rows of [[row, row], [{ ...row, resumen: { ...row.resumen, total: 999 } }]]) {
    client.defaults.adapter = async config => response(config, rows);
    await assert.rejects(api.getRegistrarDay([dailyYear], date, () => true));
  }
  let calls = 0;
  client.defaults.adapter = async config => { calls++; if (calls === 2) throw new Error('Fallo simulado'); return response(config, [row], true); };
  await assert.rejects(api.getRegistrarDay([dailyYear], date, () => true)); assert.equal(calls, 2);
});

test('sin secciones se conserva vacío y la invalidación detiene consultas posteriores', async () => {
  let calls = 0, current = true;
  client.defaults.adapter = async config => { calls++; return response(config, []); };
  assert.deepEqual(await api.getRegistrarDay([dailyYear], date, () => true), []);
  client.defaults.adapter = async config => { calls++; current = false; return response(config, dailyRows()); };
  assert.equal(await api.getRegistrarDay([dailyYear], date, () => current), null);
  assert.equal(calls, 2);
});

test('solo REGISTRADOR pierde el menú duplicado; los demás conservan Asistencias', () => {
  const menus = role => navigation.navigationFor(role);
  assert.equal(menus('REGISTRADOR').filter(item => item.path === '/secciones').length, 1);
  assert.equal(menus('REGISTRADOR').some(item => item.label === 'Asistencias'), false);
  for (const role of ['ADMIN', 'SUBDIRECCION']) assert.equal(menus(role).some(item => item.path === '/asistencias/supervision'), true);
  assert.equal(menus('SUPERUSUARIO').some(item => item.path === '/asistencias'), false);
});
