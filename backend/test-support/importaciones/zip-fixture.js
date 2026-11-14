import yazl from 'yazl';
import { Readable } from 'node:stream';

// Paquete mínimo enteramente ficticio; ningún padrón institucional.
export const minimalParts = [
  ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ficticio" sheetId="1" r:id="rId1"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'],
];

export async function makeZip(parts = minimalParts, { compress = true, zip64 = false, stream = false } = {}) {
  const zip = new yazl.ZipFile(), chunks = [];
  const complete = new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.outputStream.on('error', reject);
    zip.outputStream.on('data', chunk => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  for (const [name, data] of parts) {
    if (name.endsWith('/')) zip.addEmptyDirectory(name);
    else {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (stream) zip.addReadStream(Readable.from([bytes]), name, { compress });
      else zip.addBuffer(bytes, name, { compress });
    }
  }
  zip.end({ forceZip64Format: zip64 });
  return complete;
}

// Mutaciones de cabeceras para crear casos adversos que yazl no permite generar.
export function headers(input) {
  const end = input.length - 22, start = input.readUInt32LE(end + 16), rows = [];
  for (let cursor = start; cursor < end;) {
    const nameLength = input.readUInt16LE(cursor + 28), extraLength = input.readUInt16LE(cursor + 30);
    const local = input.readUInt32LE(cursor + 42), localNameLength = input.readUInt16LE(local + 26);
    rows.push({ central: cursor, local, nameLength, extraLength,
      name: input.subarray(cursor + 46, cursor + 46 + nameLength).toString(),
      data: local + 30 + localNameLength + input.readUInt16LE(local + 28) });
    cursor += 46 + nameLength + extraLength + input.readUInt16LE(cursor + 32);
  }
  return { end, start, rows };
}

export async function namedEntry(name, data = 'dato_privado') {
  const safeName = 'a'.repeat(Buffer.byteLength(name));
  const zip = await makeZip([...minimalParts, [safeName, data]]);
  const row = headers(zip).rows.at(-1);
  Buffer.from(name).copy(zip, row.central + 46);
  Buffer.from(name).copy(zip, row.local + 30);
  return zip;
}

// Inserta/retira bytes en la zona local y ajusta las referencias del directorio.
export function splicePayload(input, position, remove, bytes = Buffer.alloc(0)) {
  const meta = headers(input), delta = bytes.length - remove;
  if (position + remove > meta.start) throw new Error('Mutación de prueba fuera del payload.');
  const result = Buffer.concat([input.subarray(0, position), bytes, input.subarray(position + remove)]);
  result.writeUInt32LE(meta.start + delta, meta.end + delta + 16);
  for (const row of meta.rows) {
    if (row.local >= position + remove) result.writeUInt32LE(row.local + delta, row.central + delta + 42);
  }
  return result;
}
