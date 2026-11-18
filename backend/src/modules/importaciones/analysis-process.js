import { MAX_UPLOAD_FILE_BYTES } from './limits.js';
import { extractStudents } from './student-extraction.js';
import { MAX_EXTRACTION_RESPONSE_BYTES } from './analysis-result.js';

// Proceso sin configuración, credenciales ni acceso a BD. XLSX siempre es dato.
let bytes = 0;
const chunks = [];
try {
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_FILE_BYTES) throw new Error('Entrada excesiva.');
    chunks.push(chunk);
  }
  if (!bytes) throw new Error('Entrada vacía.');
  const output = JSON.stringify({ ok: true, extracted: await extractStudents(Buffer.concat(chunks, bytes)) });
  if (Buffer.byteLength(output) > MAX_EXTRACTION_RESPONSE_BYTES) throw { status: 413 };
  process.stdout.end(output);
} catch (error) {
  process.stdout.end(JSON.stringify({ ok: false, status: [400, 408, 413].includes(error.status) ? error.status : 400 }));
} finally {
  for (const chunk of chunks) chunk.fill(0);
}
