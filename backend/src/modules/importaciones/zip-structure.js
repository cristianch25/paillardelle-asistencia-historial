import yauzl from 'yauzl';
import { MAX_ZIP_ENTRIES } from './limits.js';
import { HttpError } from '../../shared/http-error.js';
import { invalidZip } from './xlsx-package.js';

export function zipEnvelope(input) {
  if (input.length < 22 || input.readUInt32LE(0) !== 0x04034b50) throw invalidZip();
  const candidates = [];
  for (let i = input.length - 22; i >= Math.max(0, input.length - 65557); i--) {
    if (input.readUInt32LE(i) === 0x06054b50 && i + 22 + input.readUInt16LE(i + 20) === input.length) candidates.push(i);
  }
  if (candidates.length !== 1) throw invalidZip();
  const end = candidates[0], count = input.readUInt16LE(end + 10);
  if (end >= 20 && input.readUInt32LE(end - 20) === 0x07064b50) throw invalidZip();
  if (input.readUInt16LE(end + 4) || input.readUInt16LE(end + 6)
    || input.readUInt16LE(end + 8) !== count || count === 0xffff) throw invalidZip();
  if (count > MAX_ZIP_ENTRIES) throw new HttpError(413, 'El contenedor supera el número de entradas permitido.');
  const start = input.readUInt32LE(end + 16), size = input.readUInt32LE(end + 12);
  if (!count || start + size !== end || start < 30) throw invalidZip();
  return { start, end };
}

function extraFields(raw) {
  let cursor = 0;
  while (cursor < raw.length) {
    if (cursor + 4 > raw.length) throw invalidZip();
    const id = raw.readUInt16LE(cursor), size = raw.readUInt16LE(cursor + 2);
    cursor += 4 + size;
    // ZIP64, Unicode Path (alias de nombre) y extensiones de cifrado.
    if (cursor > raw.length || [0x0001, 0x7075, 0x9901, 0x0017].includes(id)) throw invalidZip();
  }
  // Mantiene el parser especializado como comprobación adicional del formato.
  yauzl.parseExtraFields(raw);
}

export function entryMetadata(entry, input, centralStart) {
  const flags = entry.generalPurposeBitFlag, method = entry.compressionMethod;
  const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (![0, 8].includes(method) || (flags & ~0x080e) || (method === 0 && (flags & 6))
    || ![10, 20].includes(entry.versionNeededToExtract)
    || ((method === 8 || (flags & 8)) && entry.versionNeededToExtract !== 20)
    || input.readUInt16LE(centralStart + 34) !== 0
    || ![0, 0x8000, 0x4000].includes(kind)) throw invalidZip();
  extraFields(entry.extraFieldRaw);
}

export function entryRange(entry, local, input, centralStart) {
  if (!local.fileName.equals(entry.fileNameRaw) || local.generalPurposeBitFlag !== entry.generalPurposeBitFlag
    || local.compressionMethod !== entry.compressionMethod || local.versionNeededToExtract !== entry.versionNeededToExtract) throw invalidZip();
  extraFields(local.extraField);
  const descriptor = Boolean(entry.generalPurposeBitFlag & 8);
  for (const key of ['crc32', 'compressedSize', 'uncompressedSize']) {
    if (local[key] !== entry[key] && !(descriptor && local[key] === 0)) throw invalidZip();
  }
  let end = local.fileDataStart + entry.compressedSize;
  if (end > centralStart) throw invalidZip();
  if (descriptor) {
    if (end + 12 > centralStart) throw invalidZip();
    const signed = input.readUInt32LE(end) === 0x08074b50;
    const offset = end + (signed ? 4 : 0);
    if (offset + 12 > centralStart || input.readUInt32LE(offset) !== entry.crc32
      || input.readUInt32LE(offset + 4) !== entry.compressedSize
      || input.readUInt32LE(offset + 8) !== entry.uncompressedSize) throw invalidZip();
    end = offset + 12;
  }
  return { start: entry.relativeOffsetOfLocalHeader, end };
}

export function validateRanges(ranges, centralStart) {
  let cursor = 0;
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    if (range.start !== cursor || range.end < range.start) throw invalidZip();
    cursor = range.end;
  }
  if (cursor !== centralStart) throw invalidZip();
}
