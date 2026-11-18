import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../../shared/http-error.js';
import { MAX_UPLOAD_FILE_BYTES } from './limits.js';
import { decodeExtraction, MAX_EXTRACTION_RESPONSE_BYTES } from './analysis-result.js';

export const MAX_ANALYSIS_MS = 20_000;
export const MAX_ANALYSIS_RESPONSE_BYTES = 4096;
const entry = new URL('./analysis-process.js', import.meta.url);
// Compartido por todos los supervisores de este módulo en una instancia Node.
let active = 0;
const failed = () => new HttpError(500, 'No se pudo completar el análisis.');
const cancelled = () => new HttpError(400, 'Análisis cancelado.');
const expired = () => new HttpError(408, 'El análisis superó el plazo permitido.');

/** Opciones de composición internas, nunca procedentes de una petición HTTP.
 * No hay cola, pool, reintentos ni límite de RAM. El Buffer pertenece al llamador.
 * Se transmiten únicamente sus bytes válidos, con contrapresión y sin base64.
 * El plazo incluye arranque, transferencia y cierre; el cupo espera al cierre real.
 */
export function createAnalysisRunner({ launch = spawn, entrypoint = entry,
  executable = process.execPath, timeoutMs = MAX_ANALYSIS_MS,
  decode = decodeExtraction, maxResponseBytes = MAX_EXTRACTION_RESPONSE_BYTES } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_ANALYSIS_MS) {
    throw new TypeError('Plazo de análisis inválido.');
  }
  return function run(input, { signal } = {}) {
    if (signal != null && !(signal instanceof AbortSignal)) return Promise.reject(new HttpError(400, 'Cancelación de análisis inválida.'));
    if (!Buffer.isBuffer(input) || !input.length) return Promise.reject(new HttpError(400, 'Entrada de análisis inválida.'));
    if (input.length > MAX_UPLOAD_FILE_BYTES) return Promise.reject(new HttpError(413, 'La carga supera el tamaño permitido.'));
    if (signal?.aborted) return Promise.reject(cancelled());
    if (active >= 2) return Promise.reject(new HttpError(503, 'Hay dos análisis en curso. Intenta nuevamente.'));
    active++;
    const deadline = performance.now() + timeoutMs, bytes = input.length;
    return new Promise((resolve, reject) => {
      let child, failure, closed = false, exited = false, killing = false;
      let offset = 0, outputBytes = 0;
      const output = Buffer.alloc(maxResponseBytes);
      const unsubscribe = [];
      function listen(emitter, event, listener) {
        emitter.on(event, listener);
        unsubscribe.push(() => emitter.off(event, listener));
      }
      function stop(error) {
        failure ??= error;
        input = null;
        if (!child || exited || killing) return;
        killing = true;
        // SIGKILL no depende de que la tarea atienda mensajes ni del hilo del hijo.
        try { child.kill('SIGKILL'); } catch { /* No liberar el cupo sin confirmar salida. */ }
        child.stdin?.destroy();
      }
      const onAbort = () => stop(cancelled());
      const timer = setTimeout(() => stop(expired()), Math.max(1, deadline - performance.now()));
      function finish(code) {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        for (const remove of unsubscribe) remove();
        input = null;
        active--;
        try {
          if (performance.now() >= deadline) failure ??= expired();
          if (failure) throw failure;
          if (code !== 0 || !child.stdin?.writableFinished || !child.stdout?.readableEnded) throw failed();
          const result = decode(output.subarray(0, outputBytes), bytes);
          if (performance.now() >= deadline) throw (failure = expired());
          resolve(result);
        } catch (error) { reject(failure ?? (error instanceof HttpError ? error : failed())); }
        finally { output.fill(0); }
      }
      function transfer() {
        if (failure || !input) return;
        try {
          while (offset < bytes) {
            const chunk = input.subarray(offset, Math.min(offset + 16 * 1024, bytes));
            offset += chunk.length;
            if (!child.stdin.write(chunk)) return;
          }
          child.stdin.end();
        } catch { stop(failed()); }
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        // No heredar NODE_OPTIONS, precargas, argumentos del servidor ni secretos DB.
        const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP']
          .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
        child = launch(executable, [fileURLToPath(entrypoint)], {
          shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env });
      } catch {
        failure ??= failed();
        finish(null); // No existe un hijo que deba cerrarse.
        return;
      }
      listen(child, 'error', () => stop(failed()));
      listen(child, 'exit', () => { exited = true; });
      listen(child, 'close', finish);
      if (child.stdin) listen(child.stdin, 'error', () => stop(failed()));
      if (child.stdout) listen(child.stdout, 'error', () => stop(failed()));
      // Algunos fallos de spawn (EMFILE/ENFILE) no llegan a crear las tuberías.
      // Mantener los eventos del hijo y esperar close, también con canales parciales.
      if (!child.stdin || !child.stdout) { stop(failed()); return; }
      listen(child.stdin, 'close', () => { if (!child.stdin.writableFinished) stop(failed()); });
      listen(child.stdin, 'drain', transfer);
      listen(child.stdin, 'finish', () => { input = null; });
      listen(child.stdout, 'close', () => { if (!child.stdout.readableEnded) stop(failed()); });
      listen(child.stdout, 'data', chunk => {
        if (failure) return;
        if (outputBytes + chunk.length > output.length) return stop(failed());
        chunk.copy(output, outputBytes);
        outputBytes += chunk.length;
      });
      if (signal?.aborted) failure ??= cancelled();
      if (performance.now() >= deadline) failure ??= expired();
      if (failure) stop(failure);
      else transfer();
    });
  };
}

export const runAnalysis = createAnalysisRunner();
