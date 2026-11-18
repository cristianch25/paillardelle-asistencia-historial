import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import yauzl from 'yauzl';
import { inspectXlsxZip } from '../src/modules/importaciones/zip-inspection.js';
import { fallbackCrc32, updateCrc32 } from '../src/modules/importaciones/zip-entry-stream.js';
import { MAX_ZIP_ENTRIES, MAX_ZIP_UNCOMPRESSED_BYTES } from '../src/modules/importaciones/limits.js';
import { createAnalysisRunner } from '../src/modules/importaciones/analysis-runner.js';
import { HttpError } from '../src/shared/http-error.js';
import { makeZip, minimalParts, headers, namedEntry, splicePayload } from '../test-support/importaciones/zip-fixture.js';

function safeError(status = 400) {
  return error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, /dato_privado|\.xml|yauzl|signature|checksum|unexpected|invalid distance/i);
    return true;
  };
}
const rejected = async (input, status = 400, options) => assert.rejects(inspectXlsxZip(input, options), safeError(status));

for (const compress of [false, true]) test(`XLSX mínimo ficticio con STORE/DEFLATE (${compress})`, async () => {
  const zip = await makeZip(minimalParts, { compress });
  assert.deepEqual(await inspectXlsxZip(zip), { entries: 5,
    uncompressedBytes: minimalParts.reduce((sum, [, data]) => sum + Buffer.byteLength(data), 0) });
  const larger = Buffer.alloc(5_000_000); zip.copy(larger, 17);
  assert.equal((await inspectXlsxZip(larger.subarray(17, 17 + zip.length))).entries, 5);
});
test('directorios vacíos y descriptores de datos de yazl son admitidos', async () => {
  assert.equal((await inspectXlsxZip(await makeZip([...minimalParts, ['xl/media/', null]]))).entries, 6);
  const zip = await makeZip(minimalParts, { stream: true });
  assert.ok(zip.readUInt16LE(headers(zip).rows[0].central + 8) & 8);
  assert.equal((await inspectXlsxZip(zip)).entries, 5);
});
test('CRC incremental nativo/fallback conocido y por chunks', () => {
  const a = Buffer.from('1234'), b = Buffer.from('56789');
  assert.equal(fallbackCrc32(Buffer.concat([a, b])), 0xcbf43926);
  assert.equal(fallbackCrc32(b, fallbackCrc32(a)), 0xcbf43926);
  assert.equal(updateCrc32(b, updateCrc32(a)), 0xcbf43926);
});
test('únicamente se comprueba ZIP: XML mal formado se reserva para 1B.3B', async () => {
  const parts = minimalParts.map(([name]) => [name, '<XML ficticio incompleto']);
  assert.equal((await inspectXlsxZip(await makeZip(parts))).entries, 5);
});
for (const value of [null, 'dato_privado', Buffer.alloc(0), Buffer.from('dato_privado')]) {
  test(`rechaza entrada no ZIP (${typeof value})`, () => rejected(value));
}
test('rechaza más de 5 MB comprimidos y señales inválidas', async () => {
  await rejected(Buffer.alloc(5_000_001), 413);
  await rejected(await makeZip(), 400, { signal: {} });
});
for (const cut of [1, 10, 30]) test(`ZIP truncado (${cut})`, async () => rejected((await makeZip()).subarray(0, -cut)));
test('directorio central y datos comprimidos corruptos', async () => {
  for (const type of ['central', 'data']) {
    const zip = await makeZip(), meta = headers(zip);
    zip[meta.rows[0][type]] ^= 0xff;
    await rejected(zip);
  }
});
test('CRC detecta alteración de contenido STORE aunque conserve tamaños', async () => {
  const zip = await makeZip(minimalParts, { compress: false });
  zip[headers(zip).rows[0].data] ^= 1;
  await rejected(zip);
});
test('500 entradas exactas y rechazo de 501', async () => {
  for (const count of [MAX_ZIP_ENTRIES, MAX_ZIP_ENTRIES + 1]) {
    const padding = Array.from({ length: count - minimalParts.length }, (_, i) => [`extras/e${i}.xml`, 'x']);
    const zip = await makeZip([...minimalParts, ...padding]);
    if (count === MAX_ZIP_ENTRIES) assert.equal((await inspectXlsxZip(zip)).entries, count);
    else await rejected(zip, 413);
  }
});
test('50.000.000 bytes reales acumulados exactos y un byte de exceso', async () => {
  const minimum = minimalParts.reduce((sum, [, data]) => sum + Buffer.byteLength(data), 0);
  for (const excess of [0, 1]) {
    const zip = await makeZip([...minimalParts, ['extras/uno.dat', Buffer.alloc(25_000_000, 120)],
      ['extras/dos.dat', Buffer.alloc(MAX_ZIP_UNCOMPRESSED_BYTES - minimum - 25_000_000 + excess, 120)]]);
    if (excess) await rejected(zip, 413);
    else assert.equal((await inspectXlsxZip(zip)).uncompressedBytes, MAX_ZIP_UNCOMPRESSED_BYTES);
  }
});
for (const delta of [-1, 1]) test(`tamaño descomprimido declarado inconsistente (${delta})`, async () => {
  const zip = await makeZip(), row = headers(zip).rows[0];
  const declared = zip.readUInt32LE(row.central + 24) + delta;
  zip.writeUInt32LE(declared, row.central + 24);
  zip.writeUInt32LE(declared, row.local + 22); // Ambas cabeceras mienten igual.
  await rejected(zip);
});
test('descriptores sin firma se admiten y sus tamaños/CRC se validan', async () => {
  const original = await makeZip(minimalParts, { stream: true });
  const first = headers(original).rows[0];
  const descriptor = first.data + original.readUInt32LE(first.central + 20);
  assert.equal(original.readUInt32LE(descriptor), 0x08074b50);
  assert.equal((await inspectXlsxZip(splicePayload(original, descriptor, 4))).entries, 5);
  for (const offset of [4, 8, 12]) {
    const corrupt = Buffer.from(original); corrupt[descriptor + offset] ^= 1;
    await rejected(corrupt);
  }
});
test('DEFLATE con bytes sobrantes y relleno entre entradas no se admite', async () => {
  for (const compressedTail of [false, true]) {
    const original = await makeZip(), first = headers(original).rows[0];
    const size = original.readUInt32LE(first.central + 20);
    const changed = splicePayload(original, first.data + size, 0, Buffer.from('oculto'));
    if (compressedTail) {
      changed.writeUInt32LE(size + 6, headers(changed).rows[0].central + 20);
      changed.writeUInt32LE(size + 6, first.local + 18);
    }
    await rejected(changed);
  }
});
test('offset local repetido, prefijos y basura al final son rechazados', async () => {
  const zip = await makeZip(), meta = headers(zip);
  await rejected(Buffer.concat([Buffer.from('prefijo'), zip]));
  await rejected(Buffer.concat([zip, Buffer.from('sufijo')]));
  zip.writeUInt32LE(meta.rows[0].local, meta.rows[1].central + 42);
  await rejected(zip);
});
test('extras ambiguos/ZIP64/cifrado y atributos de directorio contradictorios', async () => {
  for (const id of [0x0001, 0x7075, 0x9901, 0x0017]) {
    const zip = await makeZip(), row = headers(zip).rows[0];
    assert.ok(row.extraLength >= 4); zip.writeUInt16LE(id, row.central + 46 + row.nameLength);
    await rejected(zip);
  }
  const zip = await makeZip(), row = headers(zip).rows[0];
  zip.writeUInt32LE(0x41ff0010, row.central + 38);
  await rejected(zip);
  await rejected(await namedEntry('directorio/', 'no vacío'));
});
test('cabecera local no puede contradecir al directorio central', async () => {
  for (const offset of [4, 6, 8, 14, 18, 22, 30]) {
    const zip = await makeZip(), row = headers(zip).rows[0];
    zip[row.local + offset] ^= 1;
    await rejected(zip);
  }
});
for (const name of ['../privado.xml', '/absoluto.xml', 'C:/privado.xml', 'xl\\privado.xml',
  'xl//privado.xml', './privado.xml', 'xl/a./privado.xml', 'xl/%2e%2e/x.xml',
  'xl/a:datos.xml', 'xl/a?b.xml', 'xl/a#b.xml', 'xl/a\0b.xml', 'xl/ñ.xml', 'xl/a b.xml']) {
  test(`nombre interno peligroso o ambiguo: ${JSON.stringify(name)}`, async () => rejected(await namedEntry(name)));
}
test('duplicados exactos, de mayúsculas y conflictos archivo/directorio', async () => {
  for (const names of [['a.xml', 'a.xml'], ['a.xml', 'A.xml'], ['a', 'a/'], ['a', 'a/b.xml'], ['a/b.xml', 'a']]) {
    await rejected(await makeZip([...minimalParts, ...names.map(name => [name, 'x'])]));
  }
});
for (const name of ['xl/vbaProject.bin', 'xl/macrosheets/sheet1.xml', 'xl/activeX/activeX1.xml',
  'xl/embeddings/oleObject1.bin', 'xl/workbook.bin', 'word/document.xml', 'ppt/presentation.xml', 'mimetype']) {
  test(`indicador de formato no admitido: ${name}`, async () => rejected(await makeZip([...minimalParts, [name, 'dato_privado']])));
}
for (const [name] of minimalParts) test(`componente esencial ausente: ${name}`, async () => {
  await rejected(await makeZip(minimalParts.filter(([part]) => part !== name)));
});
test('componentes vacíos no acreditan un paquete estructuralmente válido', async () => {
  await rejected(await makeZip(minimalParts.map(([name]) => [name, ''])));
});
for (const flag of [1, 0x40, 0x2000, 0x10]) test(`cifrado o flag no admitido ${flag}`, async () => {
  const zip = await makeZip(), row = headers(zip).rows[0];
  for (const offset of [row.central + 8, row.local + 6]) zip.writeUInt16LE(zip.readUInt16LE(offset) | flag, offset);
  await rejected(zip);
});
test('ZIP64, métodos desconocidos, enlaces simbólicos y multidisco se rechazan', async () => {
  await rejected(await makeZip(minimalParts, { zip64: true }));
  for (const kind of ['method', 'symlink', 'disk', 'central-disk', 'count', 'hidden-record']) {
    const zip = await makeZip(), meta = headers(zip), row = meta.rows[0];
    if (kind === 'method') zip.writeUInt16LE(12, row.central + 10);
    if (kind === 'symlink') zip.writeUInt32LE(0xa1ff0000, row.central + 38);
    if (kind === 'disk') zip.writeUInt16LE(1, meta.end + 6);
    if (kind === 'central-disk') zip.writeUInt16LE(1, row.central + 34);
    if (kind === 'count') zip.writeUInt16LE(4, meta.end + 8);
    if (kind === 'hidden-record') { zip.writeUInt16LE(4, meta.end + 8); zip.writeUInt16LE(4, meta.end + 10); }
    await rejected(zip);
  }
});
test('versiones de extracción incoherentes/no admitidas se rechazan en ambas cabeceras', async () => {
  for (const version of [0, 9, 10, 11, 45]) {
    const zip = await makeZip(), row = headers(zip).rows[0];
    zip.writeUInt16LE(version, row.central + 6);
    zip.writeUInt16LE(version, row.local + 4);
    await rejected(zip); // En este fixture DEFLATE requiere versión 20.
  }
});
test('cancelación previa y durante lectura cierran el ZIP sin esperar eventos close inexistentes', async () => {
  const zip = await makeZip([...minimalParts, ['extras/grande.dat', Buffer.alloc(5_000_000, 120)]]);
  for (const already of [true, false]) {
    const controller = new AbortController();
    if (already) controller.abort('dato_privado');
    const outcome = rejected(zip, 400, { signal: controller.signal });
    if (!already) setTimeout(() => controller.abort('dato_privado'), 1);
    await outcome;
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
});
test('cancelación con stream abierto destruye la lectura activa y cierra el lector', async () => {
  const original = yauzl.fromBufferPromise, controller = new AbortController();
  let reader, stream;
  yauzl.fromBufferPromise = async (...args) => {
    reader = await original(...args);
    const open = reader.openReadStreamPromise.bind(reader);
    reader.openReadStreamPromise = async (...values) => {
      stream = await open(...values);
      setImmediate(() => controller.abort('dato_privado'));
      return stream;
    };
    return reader;
  };
  try { await rejected(await makeZip(), 400, { signal: controller.signal }); }
  finally { yauzl.fromBufferPromise = original; }
  assert.equal(stream.destroyed, true);
  assert.equal(reader.isOpen, false); assert.equal(reader.reader.refCount, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});
test('el plazo cooperativo cancela un stream detenido y limpia recursos', { timeout: 30_000 }, async () => {
  const original = yauzl.fromBufferPromise;
  let reader, stream;
  yauzl.fromBufferPromise = async (...args) => {
    reader = await original(...args);
    reader.openReadStreamPromise = async () => { stream = new PassThrough(); return stream; };
    return reader;
  };
  try { await rejected(await makeZip(), 408); }
  finally { yauzl.fromBufferPromise = original; }
  assert.equal(stream.destroyed, true);
  assert.equal(reader.isOpen, false); assert.equal(reader.reader.refCount, 0);
});
test('éxitos y fallos repetidos cierran lectores y retiran listeners/timers', async () => {
  const original = yauzl.fromBufferPromise, opened = [];
  const baseline = process.getActiveResourcesInfo().filter(type => type === 'Timeout').length;
  yauzl.fromBufferPromise = async (...args) => { const zip = await original(...args); opened.push(zip); return zip; };
  try {
    for (let i = 0; i < 3; i++) { await inspectXlsxZip(await makeZip()); await rejected(await namedEntry('../x.xml')); }
  } finally { yauzl.fromBufferPromise = original; }
  for (const zip of opened) {
    assert.equal(zip.isOpen, false); assert.equal(zip.reader.refCount, 0);
    for (const event of ['entry', 'end', 'error']) assert.equal(zip.listenerCount(event), 0);
  }
  assert.ok(process.getActiveResourcesInfo().filter(type => type === 'Timeout').length <= baseline);
});
test('adaptador ficticio ejecuta la inspección aislada sin cambiar el contrato del supervisor', async () => {
  const run = createAnalysisRunner({ entrypoint: new URL('../test-support/importaciones/zip-analysis-child.js', import.meta.url),
    maxResponseBytes: 4096, decode(output, bytes) {
      const result = JSON.parse(output.toString('utf8'));
      assert.equal(result.ok, true); assert.equal(result.bytes, bytes); assert.match(result.sha256, /^[a-f0-9]{64}$/);
      return result;
    } });
  const zip = await makeZip();
  assert.equal((await run(zip)).bytes, zip.length);
  await assert.rejects(run(await namedEntry('../x.xml')), safeError(500));
});
