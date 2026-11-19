import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';

let vite, api, client;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/reportes/reportes.api.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});
after(async () => { await vite?.close(); });

test('ficha: solo GET con año/sección/mes y respuesta Blob PDF verificada', async () => {
  const query = { anio_escolar_id: '9007199254740993', seccion_id: '18446744073709551615', mes: '2026-03' }, calls = [];
  client.defaults.adapter = async config => { calls.push(config); return { config, status: 200, headers: { 'content-type': 'application/pdf' }, data: new Blob(['%PDF-1.4\n%%EOF']) }; };
  assert.ok((await api.monthlyPdf(query)).size > 5);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'get'); assert.equal(calls[0].responseType, 'blob');
  assert.deepEqual(calls[0].params, query); assert.equal(calls[0].url, '/reportes/asistencia-mensual.pdf');
  for (const [type, data] of [['text/html', '%PDF-'], ['application/pdf', '<html>'], ['application/pdf', '']]) {
    client.defaults.adapter = async config => ({ config, status: 200, headers: { 'content-type': type }, data: new Blob([data]) });
    await assert.rejects(api.monthlyPdf(query));
  }
});

test('ficha: mensajes JSON en Blob, límites y permiso sin exponer error interno', async () => {
  const failure = (status, data) => new AxiosError('SQL privado', '', {}, null, { status, data });
  assert.equal(await api.reportError(failure(422, new Blob([JSON.stringify({ error: 'Más de 30 estudiantes.' })]))), 'Más de 30 estudiantes.');
  assert.equal(await api.reportError(failure(404, { error: 'Sin estudiantes en el mes.' })), 'Sin estudiantes en el mes.');
  assert.doesNotMatch(await api.reportError(failure(500, new Blob(['SQL secreto']))), /SQL|secreto/);
  assert.match(await api.reportError(failure(403, {})), /permiso/);
});
