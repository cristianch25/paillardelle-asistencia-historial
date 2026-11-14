import yauzl from 'yauzl';
import { HttpError } from '../../shared/http-error.js';
import { MAX_UPLOAD_FILE_BYTES, MAX_ZIP_ENTRIES, MAX_ZIP_INSPECTION_MS } from './limits.js';
import { entryMetadata, entryRange, zipEnvelope, validateRanges } from './zip-structure.js';
import { packageEntry, validatePackage, invalidZip } from './xlsx-package.js';
import { inspectEntryBytes } from './zip-entry-stream.js';

/** Solo integridad ZIP y presencia de partes; no acredita XML ni un XLSX legible.
 * El llamador conserva el Buffer y no debe mutarlo durante la inspección.
 * No materializa archivos descomprimidos; el uso institucional exige proceso aislado.
 * El plazo local es cooperativo, no reemplaza la supervisión externa de 1B.2A.
 */
export async function inspectXlsxZip(input, { signal } = {}) {
  return inspectZipParts(input, { signal });
}

// Composición interna: el consumidor no recibe un resultado aprobado hasta
// comprobar también CRC, rangos y partes. Un único recorrido de descompresión.
export async function inspectZipParts(input, { signal } = {}, inspectPart) {
  if (!Buffer.isBuffer(input) || !input.length || (signal != null && !(signal instanceof AbortSignal))) throw invalidZip();
  if (input.length > MAX_UPLOAD_FILE_BYTES) throw new HttpError(413, 'La carga supera el tamaño permitido.');
  const controller = new AbortController();
  const onAbort = () => controller.abort(new HttpError(400, 'Inspección cancelada.'));
  const timer = setTimeout(() => controller.abort(new HttpError(408, 'La inspección superó el plazo permitido.')), MAX_ZIP_INSPECTION_MS);
  let zip, zipError;
  const onZipError = () => { zipError = invalidZip(); controller.abort(zipError); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) onAbort();
    controller.signal.throwIfAborted();
    const envelope = zipEnvelope(input);
    zip = await yauzl.fromBufferPromise(input, { lazyEntries: true, decodeStrings: false, validateEntrySizes: true });
    zip.on('error', onZipError);
    if (zip.readEntryCursor !== envelope.start) throw invalidZip();
    const seen = new Map(), parts = new Set(), ranges = [], budget = { bytes: 0 };
    let count = 0;
    for await (const entry of zip.eachEntry()) {
      controller.signal.throwIfAborted();
      if (++count > MAX_ZIP_ENTRIES) throw new HttpError(413, 'El contenedor supera el número de entradas permitido.');
      const centralStart = zip.readEntryCursor - 46 - entry.fileNameLength - entry.extraFieldLength - entry.fileCommentLength;
      entryMetadata(entry, input, centralStart);
      const { name, directory } = packageEntry(entry, seen);
      const local = await zip.readLocalFileHeaderPromise(entry);
      ranges.push(entryRange(entry, local, input, envelope.start));
      const consumer = inspectPart?.(name, directory, entry);
      const bytes = await inspectEntryBytes(zip, entry, budget, controller.signal, consumer);
      if (directory && bytes) throw invalidZip();
      if (!directory && bytes) parts.add(name);
    }
    controller.signal.throwIfAborted();
    if (zipError || zip.readEntryCursor !== envelope.end) throw invalidZip();
    validateRanges(ranges, envelope.start);
    validatePackage(parts);
    return { entries: count, uncompressedBytes: budget.bytes };
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error instanceof HttpError ? error : invalidZip();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    if (zip) { zip.close(); zip.off('error', onZipError); }
  }
}
