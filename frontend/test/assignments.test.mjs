import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { usersFixture } from './support/usuariosFixture.mjs';

let vite, api, client, navigation;
const response = (config, data, status = 200) => ({ config, data, status, statusText: 'OK', headers: {} });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/usuarios/assignments.api.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
});
after(async () => { await vite?.close(); });

test('catálogos específicos paginados; no usa la administración general de cuentas ni secciones', async () => {
  const source = usersFixture(), calls = [];
  client.defaults.adapter = async config => {
    calls.push(config.url);
    const [key, rows] = ({ '/asignaciones/registradores': ['registradores', source.users.slice(1, 2)],
      '/asignaciones/secciones': ['secciones', source.sections], '/asignaciones': ['asignaciones', source.assignments],
      '/anios-escolares': ['anios_escolares', source.years] })[config.url];
    return response(config, { [key]: rows, pagination: { page: config.params.page, limit: 100, has_more: false } });
  };
  const catalog = await api.getAssignmentCatalog();
  assert.deepEqual(catalog.sections, source.sections); assert.deepEqual(catalog.assignments, source.assignments);
  assert.equal(catalog.registrars.length, 1);
  assert.deepEqual(calls.sort(), ['/anios-escolares', '/asignaciones', '/asignaciones/registradores', '/asignaciones/secciones']);
  for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) {
    assert.equal(navigation.navigationFor(role).some(row => row.path === '/asignaciones-docentes'), role === 'SUBDIRECCION');
  }
});

test('una sola petición por lote, confirmación completa y sin reenvíos ante respuesta incierta', async () => {
  const input = { usuario_id: '9007199254741001', anio_escolar_id: '20', seccion_ids: ['10', '12'], fecha_inicio: '2026-03-01', fecha_fin: null };
  const rows = input.seccion_ids.map((seccion_id, index) => ({ id: String(index + 1), usuario_id: input.usuario_id,
    seccion_id, fecha_inicio: input.fecha_inicio, fecha_fin: null }));
  let calls = 0;
  client.defaults.adapter = async config => {
    calls++; assert.deepEqual(JSON.parse(config.data), input);
    assert.equal(config.url, '/asignaciones'); return response(config, { asignaciones: rows }, 201);
  };
  await api.assignSections(input); assert.equal(calls, 1);
  for (const invalid of [rows.slice(0, 1), [rows[0], rows[0]], rows.map(row => ({ ...row, id: '1' })), rows.map(row => ({ ...row, usuario_id: 'otro' })),
    rows.map(row => ({ ...row, fecha_fin: '2026-12-31' }))]) {
    calls = 0; client.defaults.adapter = async config => { calls++; return response(config, { asignaciones: invalid }, 201); };
    await assert.rejects(api.assignSections(input)); assert.equal(calls, 1);
  }
});

test('catálogo inconsistente no se publica parcialmente', async () => {
  client.defaults.adapter = async config => {
    const key = ({ '/asignaciones/registradores': 'registradores', '/asignaciones/secciones': 'secciones',
      '/asignaciones': 'asignaciones', '/anios-escolares': 'anios_escolares' })[config.url];
    return response(config, { [key]: key === 'registradores' ? [{ id: '1' }, { id: '1' }] : [],
      pagination: { page: config.params.page, limit: 100, has_more: false } });
  };
  await assert.rejects(api.getAssignmentCatalog());
});
