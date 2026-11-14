import * as zlib from 'node:zlib';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError } from '../../shared/http-error.js';
import { MAX_ZIP_UNCOMPRESSED_BYTES } from './limits.js';
import { invalidZip } from './xlsx-package.js';

// Compatibilidad con Node 22 inicial, anterior a la disponibilidad de zlib.crc32.
let crcTable;
export function fallbackCrc32(bytes, previous = 0) {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, value) => {
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  let crc = previous ^ 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export const updateCrc32 = zlib.crc32 ?? fallbackCrc32;

export async function inspectEntryBytes(zip, entry, budget, signal, consumer) {
  // Lectura raw: la descompresión y sus recursos quedan bajo nuestro pipeline.
  const raw = await zip.openReadStreamPromise(entry, { decodeFileData: false });
  const inflate = entry.compressionMethod === 8 ? zlib.createInflateRaw() : null;
  let bytes = 0, crc = 0;
  const sink = new Writable({ write(chunk, _encoding, callback) {
    bytes += chunk.length;
    budget.bytes += chunk.length;
    if (budget.bytes > MAX_ZIP_UNCOMPRESSED_BYTES) return callback(new HttpError(413, 'El contenedor supera el tamaño descomprimido permitido.'));
    if (bytes > entry.uncompressedSize) return callback(invalidZip());
    try {
      crc = updateCrc32(chunk, crc);
      consumer?.write(chunk);
      callback();
    } catch (error) { callback(error); }
  } });
  try {
    await pipeline(...[raw, inflate, sink].filter(Boolean), { signal });
    if (bytes !== entry.uncompressedSize || crc !== entry.crc32
      || (inflate && inflate.bytesWritten !== entry.compressedSize)) throw invalidZip();
    consumer?.end();
    return bytes;
  } finally {
    raw.destroy();
    inflate?.destroy();
    sink.destroy();
  }
}
