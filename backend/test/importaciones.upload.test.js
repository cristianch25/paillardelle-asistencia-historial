import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { test } from 'node:test';
import { HttpError } from '../src/shared/http-error.js';
import { receiveXlsxUpload } from '../src/modules/importaciones/upload.js';
import { UPLOAD_FIELD, MAX_UPLOAD_FILE_BYTES, MAX_MULTIPART_BYTES,
  MAX_MULTIPART_CONTENT_TYPE_BYTES } from '../src/modules/importaciones/limits.js';

// Bytes deliberadamente ficticios: estas pruebas NO acreditan contenido XLSX.
const boundary = 'paillardelle-ficticio-1b1';
const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
function part({ name = UPLOAD_FIELD, filename = 'ficticio.xlsx', data = Buffer.from('contenido ficticio'),
  mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } = {}) {
  const disposition = `Content-Disposition: form-data; name="${name}"`
    + (filename === null ? '' : `; filename="${filename}"`);
  return Buffer.concat([Buffer.from(`--${boundary}\r\n${disposition}\r\nContent-Type: ${mime}\r\n\r\n`),
    data, Buffer.from('\r\n')]);
}
function multipart(parts = [part()]) {
  return Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]);
}
function request(body, extraHeaders = {}, chunkSize = 8192) {
  function* chunks() {
    for (let offset = 0; offset < body.length; offset += chunkSize) yield body.subarray(offset, offset + chunkSize);
  }
  const input = Readable.from(chunks(), { objectMode: false });
  input.headers = { ...headers, ...extraHeaders };
  return input;
}
function clean(input, signal) {
  assert.equal(input.destroyed, true);
  for (const event of ['data', 'end', 'error', 'close', 'aborted', 'readable']) {
    assert.equal(input.listenerCount(event), 0, `listener residual: ${event}`);
  }
  if (signal) assert.equal(getEventListeners(signal, 'abort').length, 0);
}
async function rejected(input, status = 400, options) {
  await assert.rejects(receiveXlsxUpload(input, options), error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, /contenido ficticio|dato_privado|ficticio\.xlsx|Unexpected|Malformed/);
    return true;
  });
  clean(input, options?.signal);
}

test('recibe un archivo binario sin usar Content-Length y retira listeners', async () => {
  const data = Buffer.from([0, 1, 13, 10, 255, 128, 42]);
  const input = request(multipart([part({ data })]));
  const controller = new AbortController();
  const result = await receiveXlsxUpload(input, { signal: controller.signal });
  assert.ok(Buffer.isBuffer(result));
  assert.deepEqual(result, data);
  // La vista conserva una sola reserva fija, también para archivos pequeños.
  assert.equal(result.buffer.byteLength, MAX_UPLOAD_FILE_BYTES);
  clean(input, controller.signal);
});

test('MIME/nombre no validan XLSX; admite MIME genérico y no conserva rutas', async () => {
  const data = Buffer.from('esto no es un ZIP ni un XLSX');
  const input = request(multipart([part({ data, filename: '../../dato_privado.XLSX', mime: 'application/octet-stream' })]));
  assert.deepEqual(await receiveXlsxUpload(input), data);
  clean(input);
});

for (const size of [MAX_UPLOAD_FILE_BYTES - 1, MAX_UPLOAD_FILE_BYTES]) {
  test(`acepta ${size} bytes exactos aunque Content-Length declare cero`, async () => {
    const data = Buffer.alloc(size, 120);
    const input = request(multipart([part({ data })]), { 'content-length': '0' });
    assert.deepEqual(await receiveXlsxUpload(input), data);
    clean(input);
  });
}
for (const chunkSize of [8192, MAX_MULTIPART_BYTES]) {
  test(`rechaza 5.000.001 bytes con chunks de hasta ${chunkSize}`, async () => {
    const input = request(multipart([part({ data: Buffer.alloc(MAX_UPLOAD_FILE_BYTES + 1, 120) })]),
      { 'content-length': '1' }, chunkSize);
    await rejected(input, 413);
  });
}

test('acepta delimitadores y contenido fragmentados byte a byte', async () => {
  const input = request(multipart(), {}, 1);
  assert.deepEqual(await receiveXlsxUpload(input), Buffer.from('contenido ficticio'));
  clean(input);
});

for (const excess of [0, 1]) {
  test(`el cuerpo multipart completo respeta el máximo (${excess ? 'exceso' : 'exacto'})`, async () => {
    const body = multipart();
    const input = request(Buffer.concat([body, Buffer.alloc(MAX_MULTIPART_BYTES - body.length + excess, 32)]));
    if (excess) await rejected(input, 413);
    else {
      assert.deepEqual(await receiveXlsxUpload(input), Buffer.from('contenido ficticio'));
      clean(input);
    }
  });
}

const invalidBodies = [
  ['cuerpo vacío', Buffer.alloc(0)],
  ['sin archivo', multipart([])],
  ['archivo vacío', multipart([part({ data: Buffer.alloc(0) })])],
  ['archivo en otro campo', multipart([part({ name: 'otro' })])],
  ['campo textual inesperado', multipart([part({ filename: null, mime: 'text/plain' })])],
  ['campo textual después del archivo', multipart([part(), part({ filename: null, mime: 'text/plain' })])],
  ['dos archivos en el mismo campo', multipart([part(), part()])],
  ['dos archivos en campos diferentes', multipart([part(), part({ name: 'otro' })])],
  ['extensión distinta', multipart([part({ filename: 'dato_privado.xls' })])],
  ['nombre ausente', multipart([part({ filename: null, mime: 'application/octet-stream' })])],
  ['nombre vacío', multipart([part({ filename: '' })])],
  ['delimitador incorrecto', Buffer.from('--otro--\r\n')],
  ['cabecera de parte malformada', Buffer.from(`--${boundary}\r\nno-es-cabecera\r\n\r\nx\r\n--${boundary}--\r\n`)],
  ['cabecera de parte excesiva', Buffer.from(`--${boundary}\r\nX-Ficticio: ${'a'.repeat(17000)}\r\n\r\nx\r\n--${boundary}--\r\n`)],
  ['parte ignorada antes del archivo', multipart([Buffer.from(`--${boundary}\r\nX-Ficticio: x\r\n\r\nx\r\n`), part()])],
  ['parte ignorada después del archivo', multipart([part(), Buffer.from(`--${boundary}\r\nX-Ficticio: x\r\n\r\nx\r\n`)])],
];
for (const [name, body] of invalidBodies) {
  test(`rechaza ${name}`, () => rejected(request(body)));
}
test('admite cierre multipart completo sin CRLF final opcional', async () => {
  const input = request(multipart().subarray(0, -2));
  assert.deepEqual(await receiveXlsxUpload(input), Buffer.from('contenido ficticio'));
  clean(input);
});
for (const removed of [3, 10, 50, multipart().length - 4]) {
  test(`rechaza solicitud truncada (${removed} bytes retirados)`, () =>
    rejected(request(multipart().subarray(0, -removed))));
}

for (const [name, extraHeaders] of [
  ['Content-Type ausente', { 'content-type': undefined }],
  ['JSON', { 'content-type': 'application/json' }],
  ['otro subtipo multipart', { 'content-type': `multipart/mixed; boundary=${boundary}` }],
  ['sin boundary', { 'content-type': 'multipart/form-data' }],
  ['boundary vacío', { 'content-type': 'multipart/form-data; boundary=' }],
  ['Content-Type excesivo', { 'content-type': `multipart/form-data; boundary=${'a'.repeat(MAX_MULTIPART_CONTENT_TYPE_BYTES)}` }],
  ['cuerpo con codificación no admitida', { 'content-encoding': 'gzip' }],
]) {
  test(`rechaza ${name}`, () => rejected(request(multipart(), extraHeaders)));
}

function pendingRequest(options) {
  const input = new PassThrough(options);
  input.headers = headers;
  return input;
}
test('rechaza cancelación previa sin dejar listeners en AbortSignal', async () => {
  const controller = new AbortController();
  controller.abort('dato_privado');
  await rejected(pendingRequest(), 400, { signal: controller.signal });
});
for (const started of [false, true]) {
  test(`cancela una carga pendiente ${started ? 'durante el archivo' : 'antes del primer byte'}`, async () => {
    const input = pendingRequest(), controller = new AbortController();
    const checked = rejected(input, 400, { signal: controller.signal });
    if (started) input.write(part({ data: Buffer.alloc(100, 120) }).subarray(0, -2));
    controller.abort('dato_privado');
    await checked;
  });
}
for (const event of ['aborted', 'error', 'close']) {
  test(`maneja interrupción del origen: ${event}`, async () => {
    const input = pendingRequest();
    const checked = rejected(input);
    input.write(part().subarray(0, -2));
    if (event === 'error') input.destroy(new Error('dato_privado'));
    else if (event === 'close') input.destroy();
    else input.emit('aborted');
    await checked;
  });
}

test('rechaza origen ya destruido', async () => {
  const input = pendingRequest();
  input.destroy();
  await rejected(input);
});
test('rechaza streams con decodificación textual previa', async () => {
  const input = request(multipart());
  input.setEncoding('utf8');
  await rejected(input);
});
test('un rechazo temprano detiene al productor sin consumir el resto', async () => {
  let produced = 0;
  function* chunks() {
    produced++;
    yield multipart([part({ name: 'otro' })]);
    for (let i = 0; i < 1000; i++) { produced++; yield Buffer.alloc(65536); }
  }
  const input = Readable.from(chunks(), { objectMode: false });
  input.headers = headers;
  await rejected(input);
  assert.ok(produced < 10, `se consumieron ${produced} chunks`);
});
test('sucesivos errores y éxitos no dejan listeners propios ni afectan otros listeners', async () => {
  for (let i = 0; i < 5; i++) {
    await rejected(request(multipart([part(), part()])));
    const input = request(multipart());
    let closed = false;
    const listener = () => { closed = true; };
    input.on('close', listener);
    await receiveXlsxUpload(input);
    assert.equal(closed, true);
    assert.deepEqual(input.listeners('close'), [listener]);
    input.off('close', listener);
    clean(input);
  }
});

// Un fallo de regresión debe dar un error acotado, no bloquear la ejecución.
async function terminates(input, action, options) {
  let timeout;
  const outcome = rejected(input, 400, options);
  try {
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error('La recepción no terminó.'));
        input.emit('close'); // Permite limpiar también el flujo antiguo defectuoso.
      }, 1000);
    });
    action();
    await Promise.race([outcome, deadline]);
    await new Promise(resolve => setImmediate(resolve));
    clean(input, options?.signal);
  } finally { clearTimeout(timeout); }
}

for (const phase of ['previa', 'sin bytes', 'durante', 'cerca del final']) {
  test(`emitClose=false: cancelación ${phase}`, async () => {
    const input = pendingRequest({ emitClose: false }), controller = new AbortController();
    if (phase === 'previa') controller.abort('dato_privado');
    await terminates(input, () => {
      if (phase === 'durante') input.write(part().subarray(0, -2));
      if (phase === 'cerca del final') input.end(multipart());
      controller.abort('dato_privado');
    }, { signal: controller.signal });
    assert.equal(input.closed, true);
  });
}
for (const started of [false, true]) {
  test(`destrucción sin close ${started ? 'durante el archivo' : 'antes de recibir bytes'}`, async () => {
    const input = pendingRequest({ emitClose: false });
    await terminates(input, () => {
      if (started) input.write(part().subarray(0, -2));
      input.destroy();
    });
    assert.equal(input.closed, true);
  });
}
for (const event of ['error', 'close']) test(`evento ${event} durante recepción termina con HttpError seguro`, async () => {
  const input = pendingRequest({ emitClose: false });
  await terminates(input, () => {
    input.write(part().subarray(0, -2));
    if (event === 'error') input.destroy(new Error('dato_privado'));
    else input.emit('close');
  });
});
test('error asíncrono de destrucción después de recibir todo el cuerpo también rechaza y limpia', async () => {
  const input = pendingRequest({ emitClose: false, destroy(_error, callback) {
    setTimeout(() => callback(new Error('dato_privado')), 20);
  } });
  await terminates(input, () => input.end(multipart()));
});
for (const asynchronous of [false, true]) {
  test(`maneja error ${asynchronous ? 'asíncrono' : 'lanzado'} de _destroy sin close`, async () => {
    const input = pendingRequest({ emitClose: false, destroy(_error, callback) {
      if (asynchronous) setTimeout(() => callback(new Error('dato_privado')), 20);
      else throw new Error('dato_privado');
    } });
    const controller = new AbortController();
    await terminates(input, () => {
      input.write(part().subarray(0, -2));
      controller.abort();
    }, { signal: controller.signal });
    assert.equal(input.closed, true);
  });
}
test('éxito sin close limpia recursos y no se altera por una cancelación posterior', async () => {
  const input = pendingRequest({ emitClose: false }), controller = new AbortController();
  const outcome = receiveXlsxUpload(input, { signal: controller.signal });
  input.end(multipart());
  assert.deepEqual(await outcome, Buffer.from('contenido ficticio'));
  controller.abort();
  clean(input, controller.signal);
});
test('cancelación, error y destrucción concurrentes producen un solo rechazo y ningún rechazo interno', async () => {
  const input = pendingRequest({ emitClose: false }), controller = new AbortController();
  let rejections = 0;
  const count = () => { rejections++; };
  process.on('unhandledRejection', count);
  try {
    await terminates(input, () => {
      input.end(multipart());
      controller.abort('dato_privado');
      input.destroy(new Error('dato_privado'));
      controller.abort();
    }, { signal: controller.signal });
    assert.equal(rejections, 0);
  } finally { process.off('unhandledRejection', count); }
});
