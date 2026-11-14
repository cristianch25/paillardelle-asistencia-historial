import { createHash } from 'node:crypto';
import { inspectXlsxZip } from '../../src/modules/importaciones/zip-inspection.js';
import { MAX_UPLOAD_FILE_BYTES } from '../../src/modules/importaciones/limits.js';

// Adaptador de prueba: conserva el protocolo ficticio de 1B.2A, sin modificarlo.
try {
  const storage = Buffer.alloc(MAX_UPLOAD_FILE_BYTES);
  let bytes = 0;
  for await (const chunk of process.stdin) {
    if (bytes + chunk.length > storage.length) throw new Error('Entrada excesiva.');
    chunk.copy(storage, bytes); bytes += chunk.length;
  }
  const input = storage.subarray(0, bytes);
  await inspectXlsxZip(input);
  process.stdout.end(JSON.stringify({ ok: true, bytes, sha256: createHash('sha256').update(input).digest('hex') }));
} catch { process.exitCode = 1; }
