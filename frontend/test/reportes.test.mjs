import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';

let vite, api, client, printing;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/reportes/reportes.api.ts');
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  printing = await vite.ssrLoadModule('/src/features/reportes/printPdf.ts');
});
after(async () => { await vite?.close(); });

function printEnvironment(t) {
  const timers = new Map(), events = new Map(), revoked = [];
  let printed = 0, removed = 0, sequence = 0;
  const frame = { style: {}, setAttribute() {}, remove() { removed++; },
    contentWindow: { addEventListener(name, handler) { events.set(name, handler); }, focus() {}, print() { printed++; } } };
  for (const [key, value] of Object.entries({
    document: { createElement() { return frame; }, body: { append() {} } }, navigator: { pdfViewerEnabled: true },
    window: { setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  t.mock.method(URL, 'createObjectURL', () => 'blob:ficticio');
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  return { frame, events, timers, revoked, counts: () => ({ printed, removed }) };
}

test('impresión: mismo Blob, solicitud nativa y liberación al cerrar/cancelar, una sola vez', async t => {
  const env = printEnvironment(t), blob = new Blob(['%PDF-1.4']);
  const job = printing.printPdf(blob);
  assert.equal(URL.createObjectURL.mock.calls[0].arguments[0], blob);
  assert.equal(env.frame.src, 'blob:ficticio');
  env.frame.onload(); env.frame.onload(); await job.ready;
  assert.deepEqual(env.counts(), { printed: 1, removed: 0 });
  env.events.get('afterprint')(); [...env.timers.values()].find(timer => timer.ms === 0).fn();
  job.dispose(); assert.deepEqual(env.counts(), { printed: 1, removed: 1 });
  assert.deepEqual(env.revoked, ['blob:ficticio']);
});

test('impresión: salir o agotar carga libera el iframe y la URL sin imprimir', async t => {
  const env = printEnvironment(t);
  for (const timeout of [false, true]) {
    const job = printing.printPdf(new Blob(['%PDF-1.4'])), rejected = assert.rejects(job.ready, /Descarga la ficha/);
    if (timeout) [...env.timers.values()].find(timer => timer.ms === 30000).fn(); else job.dispose();
    await rejected;
  }
  assert.deepEqual(env.counts(), { printed: 0, removed: 2 });
  assert.equal(env.revoked.length, 2);
});

test('impresión: visor ausente o bloqueado ofrece alternativa y limpia los recursos', async t => {
  const env = printEnvironment(t);
  navigator.pdfViewerEnabled = false;
  assert.throws(() => printing.printPdf(new Blob()), /Descarga la ficha/);
  assert.equal(URL.createObjectURL.mock.calls.length, 0);
  navigator.pdfViewerEnabled = true;
  env.frame.contentWindow.print = () => { throw new Error('Bloqueado'); };
  const job = printing.printPdf(new Blob(['%PDF-1.4'])), rejected = assert.rejects(job.ready, /Descarga la ficha/);
  env.frame.onload(); await rejected;
  assert.deepEqual(env.revoked, ['blob:ficticio']);
});

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
