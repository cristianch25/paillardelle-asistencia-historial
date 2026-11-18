import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
let vite, api, http;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/estudiantes/perfil/phone.api.ts');
  http = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });
test('normaliza teléfono y null sin elegir entre varios números', () => {
  for (const value of ['+51 900000002', '51900000002', '900 000 002']) assert.equal(api.normalizedPhone(value), '900000002');
  assert.equal(api.normalizedPhone(' '), null);
  for (const value of ['800000002', '900000001/900000002', 'abc']) assert.throws(() => api.normalizedPhone(value));
});
test('vista previa y PATCH separados; confirmación contiene solo token y aceptación expresa', async () => {
  const calls = [];
  http.defaults.adapter = async config => {
    calls.push(config);
    return { config, status: 200, data: config.method === 'post' ? { telefono_actual: null, telefono_propuesto: '900000002',
      afecta_otros_vinculos: true, sin_cambios: false, token_confirmacion: 'a'.repeat(64), vence_en: '2099-01-01T00:00:00Z' }
      : { telefono: '900000002', actualizado: true } };
  };
  const preview = await api.previewGuardianPhone('1', '900000002');
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'post');
  await api.confirmGuardianPhone('1', preview.token_confirmacion);
  assert.deepEqual(JSON.parse(calls[1].data), { token_confirmacion: 'a'.repeat(64), confirmado: true });
  assert.equal(calls[1].method, 'patch');
});
test('una respuesta sin confirmación válida no anuncia guardado', async () => {
  for (const data of [{}, { telefono: '800000002', actualizado: true }, { telefono: '900000002' }]) {
    http.defaults.adapter = async config => ({ config, status: 200, data });
    await assert.rejects(api.confirmGuardianPhone('1', 'a'.repeat(64)));
  }
});
