import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter, getEventListeners, once } from 'node:events';
import { test } from 'node:test';
import { HttpError } from '../src/shared/http-error.js';
import { createAnalysisRunner as createRunner, MAX_ANALYSIS_MS,
  MAX_ANALYSIS_RESPONSE_BYTES } from '../src/modules/importaciones/analysis-runner.js';
import { MAX_UPLOAD_FILE_BYTES } from '../src/modules/importaciones/limits.js';
import { receiveXlsxUpload } from '../src/modules/importaciones/upload.js';
import { PassThrough, Readable } from 'node:stream';

const input = Buffer.from([0, 255, 128, 13, 10, 42]);
const fixture = new URL('../test-support/importaciones/analysis-child.js', import.meta.url);
// Pruebas del transporte aislado; producción ejecuta el extractor real.
function createAnalysisRunner(options = {}) {
  return createRunner({ entrypoint: fixture, maxResponseBytes: MAX_ANALYSIS_RESPONSE_BYTES,
    decode(output, bytes) {
      const result = JSON.parse(output.toString('utf8'));
      if (!result || Array.isArray(result) || Object.keys(result).length !== 3 || result.ok !== true
        || result.bytes !== bytes || !/^[a-f0-9]{64}$/.test(result.sha256)) throw new Error('Protocolo inválido.');
      return result;
    }, ...options });
}
const runAnalysis = createAnalysisRunner();
function runner(mode, timeoutMs = 1500) {
  const children = [];
  const run = createAnalysisRunner({ entrypoint: fixture, timeoutMs,
    launch(executable, args, options) {
      assert.equal(options.shell, false);
      assert.equal(options.windowsHide, true);
      assert.deepEqual(options.stdio, ['pipe', 'pipe', 'ignore']);
      assert.equal(options.env.NODE_OPTIONS, undefined);
      assert.equal(options.env.DB_PASSWORD, undefined);
      const child = spawn(executable, [...args, mode], options);
      children.push(child);
      return child;
    } });
  return { run, children };
}
function safeError(status) {
  return error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, /dato_privado|ENOENT|EPIPE|SyntaxError|sha256|pid/);
    return true;
  };
}
function clean(children, signal) {
  for (const child of children) {
    assert.ok(child.exitCode !== null || child.signalCode !== null);
    assert.equal(child.stdin.destroyed, true);
    assert.equal(child.stdout.destroyed, true);
    for (const event of ['error', 'exit', 'close']) assert.equal(child.listenerCount(event), 0, event);
    for (const event of ['data', 'drain', 'error', 'finish']) {
      assert.equal(child.stdin.listenerCount(event), 0, `stdin ${event}`);
      assert.equal(child.stdout.listenerCount(event), 0, `stdout ${event}`);
    }
  }
  if (signal) assert.equal(getEventListeners(signal, 'abort').length, 0);
}

test('ejecuta tarea ficticia en hijo y conserva exactamente los bytes binarios', async () => {
  const { run, children } = runner('stderr');
  assert.deepEqual(await run(input), { ok: true, bytes: input.length,
    sha256: createHash('sha256').update(input).digest('hex') });
  assert.equal(children.length, 1);
  assert.notEqual(children[0].pid, process.pid);
  assert.equal(children[0].stderr, null); // No se hereda ni captura para logs.
  clean(children);
});
test('transfiere el máximo de 5.000.000 bytes y también vistas con desplazamiento', async () => {
  for (const data of [Buffer.alloc(MAX_UPLOAD_FILE_BYTES, 42), input.subarray(1, -1)]) {
    const result = await runAnalysis(data);
    assert.equal(result.bytes, data.length);
    assert.equal(result.sha256, createHash('sha256').update(data).digest('hex'));
  }
});
test('admite dos hijos; el tercero se rechaza sin lanzar ni encolar, incluso entre supervisores', async () => {
  const first = runner('no-read'), second = runner('no-read');
  const controllers = [new AbortController(), new AbortController()];
  const outcomes = [first.run(input, { signal: controllers[0].signal }),
    second.run(input, { signal: controllers[1].signal })];
  const checks = outcomes.map(outcome => assert.rejects(outcome, safeError(400)));
  await Promise.all([once(first.children[0].stdout, 'data'), once(second.children[0].stdout, 'data')]);
  assert.notEqual(first.children[0].pid, second.children[0].pid);
  await assert.rejects(first.run(input), safeError(503));
  assert.equal(first.children.length + second.children.length, 2);
  controllers.forEach(controller => controller.abort());
  await Promise.all(checks);
  clean([...first.children, ...second.children]);
  await runAnalysis(input); // Cupos reutilizables solo tras cerrar los dos hijos.
});
test('el cupo sigue ocupado tras cancelar y hasta recibir close del hijo', async () => {
  const { run, children } = runner('no-read');
  const controllers = [new AbortController(), new AbortController()];
  const checks = controllers.map(controller => assert.rejects(run(input, { signal: controller.signal }), safeError(400)));
  controllers[0].abort();
  await assert.rejects(run(input), safeError(503));
  controllers[1].abort();
  await Promise.all(checks);
  clean(children);
});
test('plazo aprobado de 20 segundos termina un hijo con ejecución bloqueada', { timeout: 30_000 }, async () => {
  const { run, children } = runner('block-start', MAX_ANALYSIS_MS);
  const start = performance.now();
  await assert.rejects(run(input), safeError(408));
  assert.ok(performance.now() - start >= MAX_ANALYSIS_MS - 10);
  clean(children);
});
for (const mode of ['block-start', 'no-read', 'block-end', 'invalid', 'result-stall']) {
  test(`el plazo incluye arranque/transferencia/finalización: ${mode}`, async () => {
    const { run, children } = runner(mode, 200);
    await assert.rejects(run(Buffer.alloc(MAX_UPLOAD_FILE_BYTES, 120)), safeError(408));
    clean(children);
  });
}
test('cancelación previa no admite ni lanza ningún hijo', async () => {
  const { run, children } = runner('no-read');
  const controller = new AbortController();
  controller.abort('dato_privado');
  await assert.rejects(run(input, { signal: controller.signal }), safeError(400));
  assert.equal(children.length, 0);
});
test('cancelación durante el arranque mata el hijo y limpia', async () => {
  const { run, children } = runner('block-start');
  const controller = new AbortController();
  const checked = assert.rejects(run(input, { signal: controller.signal }), safeError(400));
  controller.abort('dato_privado');
  await checked;
  clean(children, controller.signal);
});
test('cancelación durante transferencia con contrapresión detiene el envío', async () => {
  const { run, children } = runner('no-read');
  const controller = new AbortController();
  const checked = assert.rejects(run(Buffer.alloc(MAX_UPLOAD_FILE_BYTES), { signal: controller.signal }), safeError(400));
  await once(children[0].stdout, 'data');
  assert.equal(children[0].stdin.writableFinished, false);
  controller.abort();
  await checked;
  clean(children, controller.signal);
});
test('cancelación al finalizar la transferencia descarta cualquier resultado posterior', async () => {
  const { run, children } = runner('block-end');
  const controller = new AbortController();
  const checked = assert.rejects(run(input, { signal: controller.signal }), safeError(400));
  await once(children[0].stdout, 'data');
  assert.equal(children[0].stdin.writableFinished, true);
  controller.abort();
  await checked;
  clean(children, controller.signal);
});
test('una respuesta válida no se confirma si se cancela antes de que salga el hijo', async () => {
  const { run, children } = runner('result-stall');
  const controller = new AbortController();
  const checked = assert.rejects(run(input, { signal: controller.signal }), safeError(400));
  const [chunk] = await once(children[0].stdout, 'data');
  assert.match(chunk.toString(), /"ok":true/);
  controller.abort();
  await checked;
  clean(children, controller.signal);
});
for (const channel of ['stdin', 'stdout']) {
  test(`cierre prematuro de ${channel} se controla y termina el hijo`, async () => {
    const { run, children } = runner('no-read');
    const checked = assert.rejects(run(Buffer.alloc(MAX_UPLOAD_FILE_BYTES)), safeError(500));
    children[0][channel].destroy();
    await checked;
    clean(children);
  });
}
for (const mode of ['crash', 'invalid-exit', 'excess']) {
  test(`rechaza fallo del hijo sin exponer su contenido: ${mode}`, async () => {
    const { run, children } = runner(mode);
    await assert.rejects(run(input), safeError(500));
    clean(children);
  });
}
for (const mode of ['response-limit', 'response-limit-plus']) {
  test(`respuesta JSON válida en el límite del protocolo: ${mode}`, async () => {
    const { run, children } = runner(mode);
    if (mode === 'response-limit') assert.equal((await run(input)).bytes, input.length);
    else await assert.rejects(run(input), safeError(500));
    clean(children);
  });
}
test('fallo síncrono de lanzamiento libera el cupo y mantiene error seguro', async () => {
  const run = createAnalysisRunner({ launch() { throw new Error('dato_privado'); } });
  for (let i = 0; i < 3; i++) await assert.rejects(run(input), safeError(500));
});
test('error asíncrono de lanzamiento se limpia tras close', async () => {
  const children = [];
  const run = createAnalysisRunner({ executable: 'ejecutable-inexistente-ficticio-1b2a', launch(...args) {
    const child = spawn(...args); children.push(child); return child;
  } });
  await assert.rejects(run(input), safeError(500));
  assert.equal(children[0].pid, undefined);
  clean(children);
});
for (const missing of ['ambos', 'stdin', 'stdout', 'indefinidos']) {
  test(`EMFILE con canales ausentes (${missing}) mantiene el cupo hasta close y devuelve HttpError`, async () => {
    const children = [], controllers = [new AbortController(), new AbortController()];
    const baseline = process.getActiveResourcesInfo().filter(type => type === 'Timeout').length;
    const run = createAnalysisRunner({ launch() {
      const child = new EventEmitter();
      child.stdin = missing === 'stdout' ? new PassThrough() : missing === 'indefinidos' ? undefined : null;
      child.stdout = missing === 'stdin' ? new PassThrough() : missing === 'indefinidos' ? undefined : null;
      child.kill = () => false; // No nació un proceso, pero spawn emitirá error y close.
      children.push(child);
      return child;
    } });
    let settled = 0;
    const checks = controllers.map(controller => {
      const outcome = run(input, { signal: controller.signal });
      outcome.then(() => { settled++; }, () => { settled++; });
      return assert.rejects(outcome, safeError(500));
    });
    for (const child of children) {
      child.emit('error', Object.assign(new Error('dato_privado'), { code: 'EMFILE' }));
      // También el canal que sí existe conserva su observador de errores.
      (child.stdin ?? child.stdout)?.emit('error', new Error('dato_privado'));
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, 0);
    await assert.rejects(run(input), safeError(503));
    assert.equal(children.length, 2);
    for (const child of children) { child.stdin?.destroy(); child.stdout?.destroy(); }
    await new Promise(resolve => setImmediate(resolve));
    for (const child of children) child.emit('close', -1);
    await Promise.all(checks);
    assert.equal(settled, 2);
    for (const child of children) {
      for (const event of ['error', 'exit', 'close']) assert.equal(child.listenerCount(event), 0);
      for (const channel of [child.stdin, child.stdout].filter(Boolean)) assert.equal(channel.listenerCount('error'), 0);
    }
    for (const controller of controllers) assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.ok(process.getActiveResourcesInfo().filter(type => type === 'Timeout').length <= baseline);
    await runAnalysis(input); // Los cupos quedan disponibles después de close.
  });
}
test('rechaza entrada inválida/excesiva y plazos que amplíen el máximo', async () => {
  for (const value of [null, 'dato_privado', Buffer.alloc(0)]) await assert.rejects(runAnalysis(value), safeError(400));
  await assert.rejects(runAnalysis(Buffer.alloc(MAX_UPLOAD_FILE_BYTES + 1)), safeError(413));
  for (const signal of [{}, false, 'dato_privado']) await assert.rejects(runAnalysis(input, { signal }), safeError(400));
  for (const timeoutMs of [0, -1, MAX_ANALYSIS_MS + 1, 1.5]) {
    assert.throws(() => createAnalysisRunner({ timeoutMs }), TypeError);
  }
});
test('recibe el Buffer de 1B.1 y transmite solo su longitud válida', async () => {
  const boundary = 'ficticio-1b2a';
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="ficticio.xlsx"\r\n\r\n`),
    input, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const request = Readable.from([body], { objectMode: false });
  request.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  const received = await receiveXlsxUpload(request);
  assert.equal(received.buffer.byteLength, MAX_UPLOAD_FILE_BYTES);
  assert.equal((await runAnalysis(received)).bytes, input.length);
});
test('los errores repetidos no dejan temporizadores ni rechazos no controlados', async () => {
  const baseline = process.getActiveResourcesInfo().filter(type => type === 'Timeout').length;
  const { run, children } = runner('excess');
  for (let i = 0; i < 3; i++) await assert.rejects(run(input), safeError(500));
  await new Promise(resolve => setImmediate(resolve));
  clean(children);
  assert.ok(process.getActiveResourcesInfo().filter(type => type === 'Timeout').length <= baseline);
  assert.equal(MAX_ANALYSIS_RESPONSE_BYTES, 4096);
});
