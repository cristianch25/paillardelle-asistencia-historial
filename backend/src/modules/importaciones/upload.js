import Busboy from 'busboy';
import { HttpError } from '../../shared/http-error.js';
import { UPLOAD_FIELD, MAX_UPLOAD_FILE_BYTES, MAX_MULTIPART_BYTES,
  MAX_MULTIPART_CONTENT_TYPE_BYTES, UPLOAD_HIGH_WATER_MARK } from './limits.js';

const invalid = () => new HttpError(400, 'Solicitud multipart inválida o incompleta.');
const tooLarge = () => new HttpError(413, 'La carga supera el tamaño permitido.');
const cancelled = () => new HttpError(400, 'Recepción de archivo cancelada.');

/**
 * Consume un Readable binario exclusivo con headers HTTP; lo destruye al rechazar.
 * El adaptador HTTP debe contemplar que el transporte puede estar cerrado.
 * Devuelve bytes NO validados como XLSX: nombre/MIME no acreditan su contenido.
 * Reserva un único Buffer de 5 MB al recibir el archivo, sin lista de chunks/copias.
 * La vista devuelta retiene esa reserva: el llamador debe soltarla al terminar.
 * En error se borra la reserva y siempre se retiran los listeners propios.
 * No limita memoria de otros consumidores, concurrencia ni duración de la carga.
 */
export async function receiveXlsxUpload(request, { signal } = {}) {
  let parser, file, storage, failure, checkHandle;
  let destroying = false;
  let fileBytes = 0, bodyBytes = 0;
  const unsubscribe = [];
  let complete;
  const completion = new Promise(resolve => { complete = resolve; });
  function listen(emitter, event, listener) {
    emitter.on(event, listener);
    unsubscribe.push(() => emitter.off(event, listener));
  }
  function scheduleCheck() {
    checkHandle ??= setImmediate(() => { checkHandle = undefined; check(); });
  }
  function check() {
    const streams = [request, parser, file].filter(Boolean);
    const ended = request.readableEnded && parser?.writableFinished;
    if (!failure && streams.some(stream => stream.destroyed
      && !(stream === parser ? stream.writableFinished : stream.readableEnded))) stop(invalid());
    if (!failure && ended && (!file?.readableEnded || file.truncated || !fileBytes)) stop(invalid());
    // closed cambia aunque emitClose=false. Esperar la destrucción conserva los
    // observadores hasta después de sus posibles errores asíncronos.
    if (destroying || streams.some(stream => stream.destroyed && !stream.closed)) return;
    if (failure || ended) complete();
  }
  function stop(error) {
    if (failure) return;
    failure = error;
    request.pause();
    destroying = true;
    // Busboy aún puede estar dentro de un callback que usa su fileStream.
    queueMicrotask(() => {
      for (const stream of [file, parser, request]) {
        try { stream?.destroy(); } catch { /* Preservar el error controlado y destruir los demás. */ }
      }
      destroying = false;
      scheduleCheck();
    });
  }
  const onAbort = () => stop(cancelled());
  // Detecta destrucción externa silenciosa sin sustituir métodos del stream.
  const monitor = setInterval(scheduleCheck, 10);
  try {
    listen(request, 'error', () => stop(invalid()));
    listen(request, 'close', () => {
      if (!request.readableEnded) stop(invalid());
      scheduleCheck();
    });
    listen(request, 'aborted', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
    const contentType = request.headers?.['content-type'];
    if (signal?.aborted) stop(cancelled());
    else if (request.destroyed || request.readableEnded || request.aborted || request.readableEncoding) stop(invalid());
    else if (typeof contentType !== 'string' || Buffer.byteLength(contentType) > MAX_MULTIPART_CONTENT_TYPE_BYTES
      || !/^multipart\/form-data(?:;|$)/i.test(contentType)
      || (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')) stop(invalid());
    if (!failure) {
      try {
        parser = Busboy({ headers: { 'content-type': contentType },
          highWaterMark: UPLOAD_HIGH_WATER_MARK, fileHwm: UPLOAD_HIGH_WATER_MARK,
          // Busboy señala 'limit' al alcanzar su máximo: +1 permite exactamente 5 MB.
          limits: { fileSize: MAX_UPLOAD_FILE_BYTES + 1, files: 1, fields: 0, parts: 2, fieldSize: 0 } });
      } catch { stop(invalid()); }
    }
    if (parser) {
      listen(parser, 'error', () => stop(invalid()));
      listen(parser, 'finish', scheduleCheck);
      listen(parser, 'close', scheduleCheck);
      listen(parser, 'file', (name, stream, info) => {
        file = stream;
        listen(stream, 'error', () => stop(invalid()));
        listen(stream, 'end', scheduleCheck);
        listen(stream, 'close', scheduleCheck);
        listen(stream, 'limit', () => stop(tooLarge()));
        listen(stream, 'data', chunk => {
          if (failure) return;
          if (fileBytes + chunk.length > MAX_UPLOAD_FILE_BYTES) return stop(tooLarge());
          chunk.copy(storage, fileBytes);
          fileBytes += chunk.length;
        });
        if (name !== UPLOAD_FIELD || !info.filename || !/\.xlsx$/i.test(info.filename)) return stop(invalid());
        storage = Buffer.alloc(MAX_UPLOAD_FILE_BYTES);
      });
      listen(parser, 'filesLimit', () => stop(invalid()));
      listen(parser, 'fieldsLimit', () => stop(invalid()));
      // El segundo part también se rechaza si Busboy ignora su Content-Disposition.
      listen(parser, 'partsLimit', () => stop(invalid()));
      listen(parser, 'drain', () => { if (!failure) request.resume(); });
      listen(request, 'data', chunk => {
        if (failure) return;
        if (!Buffer.isBuffer(chunk)) return stop(invalid());
        bodyBytes += chunk.length;
        if (bodyBytes > MAX_MULTIPART_BYTES) return stop(tooLarge());
        try { if (!parser.write(chunk)) request.pause(); } catch { stop(invalid()); }
      });
      listen(request, 'end', () => {
        try { if (!failure) parser.end(); } catch { stop(invalid()); }
        scheduleCheck();
      });
      if (!failure) request.resume();
    }
    await completion;
    if (failure) throw failure;
    return storage.subarray(0, fileBytes);
  } finally {
    clearInterval(monitor);
    clearImmediate(checkHandle);
    for (const remove of unsubscribe) remove();
    signal?.removeEventListener('abort', onAbort);
    if (failure) storage?.fill(0);
    storage = null;
  }
}
