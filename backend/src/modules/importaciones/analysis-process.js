import { createHash } from 'node:crypto';
import { MAX_UPLOAD_FILE_BYTES } from './limits.js';

// Tarea ficticia de 1B.2A: no interpreta XLSX ni importa aplicación/configuración.
// stdin es binario; stdout es exclusivamente el protocolo privado del supervisor.
let bytes = 0;
const hash = createHash('sha256');
try {
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_FILE_BYTES) throw new Error('Entrada excesiva.');
    hash.update(chunk);
  }
  if (!bytes) throw new Error('Entrada vacía.');
  process.stdout.end(JSON.stringify({ ok: true, bytes, sha256: hash.digest('hex') }));
} catch {
  // No imprimir excepciones originales ni datos recibidos.
  process.exitCode = 1;
}
