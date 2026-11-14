import yazl from 'yazl';
import { inspectZipParts } from './zip-inspection.js';
import { inspectXlsxXml } from './xml-inspection.js';
import { createXmlStream, attribute as attr, invalidXml, xmlLimit } from './xml-stream.js';
import { internalTarget } from './ooxml-package.js';
import { MAX_UPLOAD_FILE_BYTES, MAX_ZIP_UNCOMPRESSED_BYTES } from './limits.js';

const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
const escapeAttribute = value => escapeText(value).replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');

// Solo las partes incompatibles se serializan de nuevo con SAX. No interpreta
// valores: conserva nombres expandidos, texto y atributos sin evaluar fórmulas.
function normalizedXml(name, metadata, append, check) {
  let rowIndex = 0;
  return createXmlStream({
    open(tag) {
      check();
      const attributes = Object.values(tag.attributes).map(value => {
        let content = value.value;
        if (name === 'xl/_rels/workbook.xml.rels' && tag.local === 'Relationship' && value.name === 'Target') {
          content = '/' + internalTarget('xl/workbook.xml', content);
        }
        return `${value.name}="${escapeAttribute(content)}"`;
      });
      if (metadata && tag.local === 'row') {
        if (attr(tag, 'r') === undefined) attributes.push(`r="${metadata.rows[rowIndex].number}"`);
        rowIndex++;
      }
      append(`<${tag.name}${attributes.length ? ' ' + attributes.join(' ') : ''}>`);
    },
    text(value) { append(escapeText(value)); },
    close(tag) { append(`</${tag.name}>`); },
  });
}

/** Devuelve el mismo Buffer si ya es compatible. La reconstrucción usa un único
 * recorrido adicional, conserva las partes binarias y se revalida antes de leer.
 * Ambos tamaños (comprimido y XML real normalizado) mantienen los máximos T01.
 */
export async function prepareXlsxReaderPackage(input, manifest, { signal, check }) {
  check();
  if (!manifest.changes.size) return { buffer: input, normalized: false };
  const writer = new yazl.ZipFile(), output = Buffer.alloc(MAX_UPLOAD_FILE_BYTES);
  let size = 0, expanded = 0, failure;
  // En cancelación drenar la compresión ya iniciada: yazl no ofrece abort().
  // No abandonar trabajos zlib ni liberar el cupo mientras sigan pendientes.
  const fail = error => { failure ??= error; };
  const aborted = () => { try { check(); } catch (error) { fail(error); } };
  const completion = new Promise(resolve => {
    writer.on('error', () => { fail(invalidXml()); writer.outputStream.destroy(); });
    writer.outputStream.on('error', () => { failure ??= invalidXml(); });
    writer.outputStream.on('close', resolve);
    writer.outputStream.on('end', resolve);
    writer.outputStream.on('data', chunk => {
      if (failure) return;
      try {
        check();
        if (size + chunk.length > output.length) throw xmlLimit();
        chunk.copy(output, size); size += chunk.length;
      } catch (error) { fail(error); }
    });
  });
  signal?.addEventListener('abort', aborted, { once: true });
  try {
    await inspectZipParts(input, { signal }, (name, directory, entry) => {
      check();
      if (failure) throw failure;
      if (directory) { writer.addEmptyDirectory(name); return; }
      const changed = manifest.changes.has(name);
      let used = 0, capacity = changed ? Math.min(16384, MAX_ZIP_UNCOMPRESSED_BYTES) : entry.uncompressedSize;
      let storage = Buffer.alloc(capacity);
      function append(value) {
        check();
        const bytes = typeof value === 'string' ? Buffer.byteLength(value) : value.length;
        if (expanded + bytes > MAX_ZIP_UNCOMPRESSED_BYTES) throw xmlLimit();
        if (used + bytes > capacity) {
          capacity = Math.min(MAX_ZIP_UNCOMPRESSED_BYTES, Math.max(used + bytes, capacity * 2));
          const grown = Buffer.alloc(capacity); storage.copy(grown, 0, 0, used); storage = grown;
        }
        if (typeof value === 'string') storage.write(value, used); else value.copy(storage, used);
        used += bytes; expanded += bytes;
      }
      const xml = changed ? normalizedXml(name, manifest.worksheets.get(name), append, check) : null;
      return {
        write(chunk) { if (xml) xml.write(chunk); else append(chunk); },
        end() {
          xml?.end(); check();
          if (failure) throw failure;
          writer.addBuffer(storage.subarray(0, used), name);
          storage = null;
        },
      };
    });
    writer.end();
    await completion;
    check();
    if (failure) throw failure;
    const buffer = output.subarray(0, size);
    await inspectXlsxXml(buffer, { signal });
    check();
    return { buffer, normalized: true };
  } catch (error) {
    fail(error);
    writer.end();
    await completion;
    output.fill(0);
    throw failure;
  } finally {
    signal?.removeEventListener('abort', aborted);
    writer.outputStream.destroy();
  }
}
