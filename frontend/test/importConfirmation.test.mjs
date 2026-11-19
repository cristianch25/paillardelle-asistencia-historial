import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';

let vite, api, client;
const input = { aceptar: true, version_plan: 'a'.repeat(64), filas: ['1:8'],
  clave_operacion: '11111111-1111-4111-8111-111111111111', decisiones_telefono: [{ id_propuesta: 'a3', decision: 'CONSERVAR' }] };
const saved = { estado: 'CONFIRMADA', confirmacion_id: '9007199254740999', repetida: false,
  cantidades: { estudiantes: 1, matriculas: 1, contactos: 1, vinculos: 1, telefonos: 0, telefonos_conservados: 1, contactos_pendientes: 0 },
  filas: [{ fila: '1:8', estudiante_id: '9007199254740993', matricula_id: '9007199254740995', contacto_pendiente: false }] };
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  api = await vite.ssrLoadModule('/src/features/importaciones/confirmation.api.ts');
});
after(async () => { await vite?.close(); });

test('POST único conserva selección, versión, clave y decisiones; GET consulta sin repetir escrituras', async () => {
  const calls = [];
  client.defaults.adapter = async config => { calls.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : null });
    return { config, status: 200, headers: {}, data: saved }; };
  assert.deepEqual(await api.confirmImport('preview', input), saved);
  assert.deepEqual(await api.readImportOperation(input.clave_operacion), saved);
  assert.deepEqual(calls, [{ method: 'post', url: '/importaciones/vistas-previas/preview/confirmacion', body: input },
    { method: 'get', url: `/importaciones/confirmaciones/${input.clave_operacion}`, body: null }]);
});

test('respuesta incompleta, selección ajena o cantidades inválidas no anuncian confirmación', async () => {
  for (const data of [{}, { ...saved, filas: [] }, { ...saved, filas: [{ ...saved.filas[0], fila: '1:9' }] },
    { ...saved, cantidades: { ...saved.cantidades, contactos: -1 } }]) {
    client.defaults.adapter = async config => ({ config, status: 200, headers: {}, data });
    await assert.rejects(api.confirmImport('preview', input));
  }
});

test('error 500/red no reintenta POST; SIN_CONFIRMACION_VERIFICADA se conserva como incertidumbre', async () => {
  for (const status of [500, undefined]) {
    let calls = 0;
    client.defaults.adapter = async config => { calls++; throw new AxiosError('privado', '', config, null, status ? { config, status } : undefined); };
    await assert.rejects(api.confirmImport('preview', input)); assert.equal(calls, 1);
  }
  client.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { estado: 'SIN_CONFIRMACION_VERIFICADA' } });
  assert.equal((await api.readImportOperation(input.clave_operacion)).estado, 'SIN_CONFIRMACION_VERIFICADA');
});
