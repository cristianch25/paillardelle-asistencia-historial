import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import yauzl from 'yauzl';
import { inspectXlsxXml } from '../src/modules/importaciones/xml-inspection.js';
import { inspectXlsxZip } from '../src/modules/importaciones/zip-inspection.js';
import { createXmlStream, MAIN_NS, REL_NS } from '../src/modules/importaciones/xml-stream.js';
import { cellCoordinate } from '../src/modules/importaciones/worksheet-coordinates.js';
import { HttpError } from '../src/shared/http-error.js';
import { makeZip, minimalParts } from '../test-support/importaciones/zip-fixture.js';

const sheet = body => `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${body}</worksheet>`;
function parts(body = '<sheetData/>', count = 1) {
  const base = minimalParts.map(([name, xml]) => [name, xml]);
  base[4][1] = sheet(body);
  if (count > 1) {
    base[2][1] = base[2][1].replace(/<sheet [^>]+\/>/, Array.from({ length: count }, (_, i) =>
      `<sheet name="Hoja${i + 1}" sheetId="${i + 1}" state="hidden" r:id="rId${i + 1}"/>`).join(''));
    for (let i = 2; i <= count; i++) {
      base[0][1] = base[0][1].replace('</Types>', `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
      base[3][1] = base[3][1].replace('</Relationships>', `<Relationship Id="rId${i}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i}.xml"/></Relationships>`);
      base.push([`xl/worksheets/sheet${i}.xml`, sheet(body)]);
    }
  }
  return base;
}
function auxiliary(input, kind, xml) {
  const result = input.map(([name, content]) => [name, content]);
  result[0][1] = result[0][1].replace('</Types>', `<Override PartName="/xl/${kind}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${kind}+xml"/></Types>`);
  result[3][1] = result[3][1].replace('</Relationships>', `<Relationship Id="${kind}" Type="${REL_NS}/${kind}" Target="${kind}.xml"/></Relationships>`);
  result.push([`xl/${kind}.xml`, xml]);
  return result;
}
const safeError = (status = 400) => error => {
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, status);
  assert.doesNotMatch(error.message, /dato_privado|\.xml|saxes|unexpected|line |column |xmlns/i);
  return true;
};
const inspect = async input => inspectXlsxXml(await makeZip(input));
const rejected = async (input, status = 400) => assert.rejects(inspect(input), safeError(status));

test('mínimo, orden inverso y resultado técnico sin contenido', async () => {
  const zip = await makeZip();
  assert.deepEqual(await inspectXlsxXml(zip), { ...await inspectXlsxZip(zip), sheets: 1, xmlCells: 0, materializablePositions: 0 });
  assert.equal((await inspect([...minimalParts].reverse())).sheets, 1);
});

test('20 hojas incluidas ocultas y rechazo de 21', async () => {
  assert.equal((await inspect(parts('<sheetData/>', 20))).sheets, 20);
  await rejected(parts('<sheetData/>', 21), 413);
});

for (const [coordinate, status] of [['A4096', 0], ['DX1', 0], ['A4097', 413], ['DY1', 413],
  ['A0', 400], ['a1', 400], ['A01', 400], ['A1:B2', 400], ['XFD1048576', 413]]) {
  test(`coordenada ${coordinate}`, async () => {
    const input = parts(`<sheetData><row><c r="${coordinate}"/></row></sheetData>`);
    if (status) await rejected(input, status);
    else assert.equal((await inspect(input)).xmlCells, 1);
  });
}

test('200.000 posiciones exactas, exceso y celda dispersa DX4096', async () => {
  assert.equal((await inspect(parts('<sheetData><row><c r="CB2500"/></row></sheetData>'))).materializablePositions, 200000);
  await rejected(parts('<sheetData><row><c r="CB2501"/></row></sheetData>'), 413);
  await rejected(parts('<sheetData><row><c r="DX4096"/></row></sheetData>'), 413);
});

test('presupuesto acumulado entre hojas, no reiniciado por hoja', async () => {
  const input = parts('<sheetData><row><c r="AX2000"/></row></sheetData>', 2);
  assert.equal((await inspect(input)).materializablePositions, 200000);
  input.at(-1)[1] = sheet('<sheetData><row><c r="AX2001"/></row></sheetData>');
  await rejected(input, 413);
  const oneOver = parts('<sheetData><row><c r="CB2500"/></row></sheetData>', 2);
  oneOver.at(-1)[1] = sheet('<sheetData><row><c r="A1"/></row></sheetData>');
  await rejected(oneOver, 413); // 200.001 posiciones exactas.
});

function denseBody(rows = 2000, cols = 100) {
  let body = '<sheetData>';
  function letters(column) {
    let value = '';
    while (column) { column--; value = String.fromCharCode(65 + column % 26) + value; column = Math.floor(column / 26); }
    return value;
  }
  for (let r = 1; r <= rows; r++) {
    body += `<row r="${r}">`;
    for (let c = 1; c <= cols; c++) body += `<c r="${letters(c)}${r}"/>`;
    body += '</row>';
  }
  return body + '</sheetData>';
}

test('200.000 celdas XML exactas y exceso independiente del área', async () => {
  const body = denseBody();
  const result = await inspect(parts(body));
  assert.equal(result.xmlCells, 200000); assert.equal(result.materializablePositions, 200000);
  // La celda duplicada no aumenta el área, pero sí el contador XML: falla 413 primero.
  await rejected(parts(body.replace('</sheetData>', '<row r="2001"><c r="A1"/></row></sheetData>')), 413);
});

test('celdas XML se acumulan entre hojas', async () => {
  const result = await inspect(parts(denseBody(1000), 2));
  assert.equal(result.xmlCells, 200000);
  await rejected(parts(denseBody(1000), 3), 413);
});

test('profundidad 64 exacta y 65 en XML auxiliar inspeccionado', async () => {
  for (const depth of [64, 65]) {
    const input = auxiliary(parts(), 'sharedStrings', `<sst xmlns="${MAIN_NS}">` + '<x>'.repeat(depth - 1) + '</x>'.repeat(depth - 1) + '</sst>');
    if (depth === 64) await inspect(input);
    else await rejected(input, 413);
  }
});

for (const body of [
  '<dimension ref="A1"/><sheetData><row><c r="DX4096"/></row></sheetData>',
  '<dimension ref="A1:DX4096"/><sheetData/>',
  '<sheetData/><mergeCells><mergeCell ref="A1:DX4096"/></mergeCells>',
  '<sheetData><row r="4097"/></sheetData>',
  '<sheetData/><cols><col min="1" max="129"/></cols>',
]) test('metadatos y coordenadas efectivas no eluden máximos', () => rejected(parts(body), 413));

for (const body of [
  '<sheetData><row r="2"><c r="A1"/></row></sheetData>',
  '<sheetData><row><c r="B1"/><c r="A1"/></row></sheetData>',
  '<sheetData><row><c r="A1"/><c r="A1"/></row></sheetData>',
  '<sheetData><row r="2"/><row r="1"/></sheetData>',
  '<sheetData><row><c/></row></sheetData>',
  '<sheetData/><sheetData/>', '<sheetData/><mergeCells><mergeCell ref="B2:A1"/></mergeCells>',
  '<sheetData/><mergeCells><mergeCell ref="A1:B2"/><mergeCell ref="B2:C3"/></mergeCells>',
  '<sheetData><row><c r="A1" t="s"/></row></sheetData>',
  '<sheetData><row><c r="A1"><v>1</v><v>2</v></c></row></sheetData>',
]) test('rechaza incoherencia en filas, celdas o rangos', () => rejected(parts(body)));

test('filas implícitas, filas vacías y combinaciones legítimas', async () => {
  const result = await inspect(parts('<sheetData><row/><row><c r="C2" t="inlineStr"><is><t>dato_privado &amp; &#65;</t></is></c></row></sheetData><mergeCells><mergeCell ref="A1:C1"/></mergeCells>'));
  assert.equal(result.materializablePositions, 6);
});

test('cadenas compartidas y estilos: orden independiente e índices reales', async () => {
  let input = auxiliary(parts('<sheetData><row><c r="A1" t="s" s="0"><v>0</v></c></row></sheetData>'), 'sharedStrings', `<sst xmlns="${MAIN_NS}" uniqueCount="1"><si><t>dato_privado</t></si></sst>`);
  input = auxiliary(input, 'styles', `<styleSheet xmlns="${MAIN_NS}"><cellXfs count="1"><xf/></cellXfs></styleSheet>`);
  await inspect(input); await inspect(input.reverse());
  const cell = input.find(([name]) => name.endsWith('sheet1.xml'));
  cell[1] = cell[1].replace('<v>0</v>', '<v>1</v>'); await rejected(input);
  cell[1] = cell[1].replace('<v>1</v>', '<v>0</v>').replace('s="0"', 's="1"'); await rejected(input);
});

for (const body of [
  '<sheetData><row><c r="A1" t="s"><v>0</v></c></row></sheetData>',
  '<sheetData><row><c r="A1" s="0"/></row></sheetData>',
]) test('referencia auxiliar sin parte correspondiente', () => rejected(parts(body)));

for (const xml of [
  `<styleSheet xmlns="${MAIN_NS}"><cellXfs><xf xfId="0"/></cellXfs></styleSheet>`,
  `<styleSheet xmlns="${MAIN_NS}"><cellXfs count="2"><xf/></cellXfs></styleSheet>`,
  `<styleSheet xmlns="${MAIN_NS}"><cellXfs><xf numFmtId="999999999"/></cellXfs></styleSheet>`,
  `<styleSheet xmlns="${MAIN_NS}"><cellXfs><xf numFmtId="164"/></cellXfs></styleSheet>`,
]) test('estilos: índices, cantidades y formato personalizado inexistente', () => rejected(auxiliary(parts(), 'styles', xml)));

test('fórmulas compartidas: referencias estructurales sin evaluación', async () => {
  const body = '<sheetData><row><c r="A1"><f t="shared" si="0" ref="A1:B1">1+1</f><v>2</v></c><c r="B1"><f t="shared" si="0"/><v>2</v></c></row></sheetData>';
  await inspect(parts(body));
  await rejected(parts(body.replace('ref="A1:B1"', 'ref="A1"')));
  await rejected(parts(body.replace('si="0" ref', 'si="1" ref')));
});

test('cadena de cálculo: hoja y coordenada deben existir', async () => {
  const input = auxiliary(parts('<sheetData><row><c r="A1"><f>1+1</f></c></row></sheetData>'), 'calcChain', `<calcChain xmlns="${MAIN_NS}"><c r="A1" i="1"/></calcChain>`);
  await inspect(input);
  for (const [before, after] of [['i="1"', 'i="2"'], ['r="A1"', 'r="B1"']]) {
    const changed = input.map(([name, xml]) => [name, name === 'xl/calcChain.xml' ? xml.replace(before, after) : xml]);
    await rejected(changed);
  }
  input.at(-1)[1] = input.at(-1)[1].replace('A1', 'A4097'); await rejected(input, 413);
});

test('tablas pasivas: relación y rangos aportan al presupuesto de su hoja', async () => {
  const input = parts('<sheetData/><tableParts count="1"><tablePart r:id="tabla"/></tableParts>');
  input[0][1] = input[0][1].replace('</Types>', '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>');
  input.push(['xl/worksheets/_rels/sheet1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="tabla" Type="${REL_NS}/table" Target="../tables/table1.xml"/></Relationships>`]);
  input.push(['xl/tables/table1.xml', `<table xmlns="${MAIN_NS}" ref="A1:C3"/>`]);
  assert.equal((await inspect(input)).materializablePositions, 9);
  input.at(-1)[1] = input.at(-1)[1].replace('A1:C3', 'A1:DX4096'); await rejected(input, 413);
});

test('rechaza componente pasivo huérfano y namespace falso en descendientes', async () => {
  const input = parts();
  input[0][1] = input[0][1].replace('</Types>', '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
  input.push(['xl/theme/theme1.xml', '<theme xmlns="http://schemas.openxmlformats.org/drawingml/2006/main"/>']);
  await rejected(input);
  await rejected(parts('<sheetData><row><c xmlns="urn:falso" r="A1"/></row></sheetData>'));
  await rejected(parts('<sheetData/><noSoportado/>'));
});

test('rechaza identificadores peligrosos para mapas del lector futuro', async () => {
  const input = parts();
  input[2][1] = input[2][1].replace('rId1', '__proto__');
  input[3][1] = input[3][1].replace('rId1', '__proto__');
  await rejected(input);
});

test('formatos diferenciales: referencia existente y ausente', async () => {
  const body = '<sheetData/><conditionalFormatting sqref="A1"><cfRule type="expression" dxfId="0"><formula>1</formula></cfRule></conditionalFormatting>';
  await rejected(parts(body));
  const input = auxiliary(parts(body), 'styles', `<styleSheet xmlns="${MAIN_NS}"><dxfs count="1"><dxf/></dxfs></styleSheet>`);
  await inspect(input);
  input[4][1] = input[4][1].replace('dxfId="0"', 'dxfId="1"'); await rejected(input);
});

test('tema y propiedades pasivos legítimos no se rechazan por presencia', async () => {
  const input = parts();
  input[0][1] = input[0][1].replace('</Types>', '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
  input[3][1] = input[3][1].replace('</Relationships>', `<Relationship Id="tema" Type="${REL_NS}/theme" Target="theme/theme1.xml"/></Relationships>`);
  input.push(['xl/theme/theme1.xml', '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Ficticio"><a:themeElements/></a:theme>']);
  await inspect(input);
});

for (const [index, before, after] of [
  [0, 'spreadsheetml.worksheet+xml', 'spreadsheetml.macrosheet+xml'],
  [0, 'PartName="/xl/worksheets/sheet1.xml"', 'PartName="/xl/worksheets/ausente.xml"'],
  [1, 'Target="xl/workbook.xml"', 'Target="../xl/workbook.xml"'],
  [1, 'Target="xl/workbook.xml"', 'Target="https://dato_privado"'],
  [3, 'Target="worksheets/sheet1.xml"', 'Target="worksheets/ausente.xml"'],
  [3, 'Target="worksheets/sheet1.xml"', 'Target="../../../sheet1.xml"'],
  [3, 'Target="worksheets/sheet1.xml"', 'TargetMode="External" Target="worksheets/sheet1.xml"'],
  [3, '/worksheet"', '/styles"'], [2, 'r:id="rId1"', 'r:id="ausente"'],
  [2, MAIN_NS, 'urn:incorrecto'], [4, MAIN_NS, 'urn:incorrecto'],
]) test('relaciones, tipos y namespaces incompatibles', async () => {
  const input = parts(); input[index][1] = input[index][1].replace(before, after); await rejected(input);
});

test('destinos absolutos de paquete y relativos con .. legítimo', async () => {
  const input = parts();
  input[3][1] = input[3][1].replace('worksheets/sheet1.xml', '../xl/worksheets/sheet1.xml');
  await inspect(input);
  input[3][1] = input[3][1].replace('../xl/worksheets/sheet1.xml', '/xl/worksheets/sheet1.xml');
  await inspect(input);
});

test('duplicados de relación, IDs/nombres de hoja y hojas huérfanas', async () => {
  const duplicate = parts();
  duplicate[3][1] = duplicate[3][1].replace('</Relationships>', duplicate[3][1].match(/<Relationship Id[^>]+\/>/)[0] + '</Relationships>');
  await rejected(duplicate);
  for (const [before, after] of [['sheetId="2"', 'sheetId="1"'], ['name="Hoja2"', 'name="HOJA1"'], ['r:id="rId2"', 'r:id="rId1"']]) {
    const input = parts('<sheetData/>', 2); input[2][1] = input[2][1].replace(before, after); await rejected(input);
  }
  const orphan = parts('<sheetData/>', 2);
  orphan[2][1] = orphan[2][1].replace(/<sheet name="Hoja2"[^>]+\/>/, ''); await rejected(orphan);
});

for (const xml of ['<worksheet', '<worksheet/>dato_privado', '<!DOCTYPE x><x/>',
  '<!DOCTYPE x [<!ENTITY secreto "dato_privado">]><x>&secreto;</x>',
  '<!DOCTYPE x SYSTEM "file:///dato_privado"><x/>',
  sheet('<sheetData/>&personalizada;'), sheet('<sheetData/><extLst/>'),
  sheet('<sheetData/><oleObjects/>'), sheet('<sheetData/><?procesar dato_privado?>'),
]) test('XML corrupto, entidades y estructuras peligrosas', async () => {
  const input = parts(); input[4][1] = xml; await rejected(input);
});

test('UTF-8/UTF-16 y tokens partidos: decodificación incremental estricta', async () => {
  for (const encoding of ['utf8', 'utf16le']) {
    const declaration = encoding === 'utf8' ? 'UTF-8' : 'UTF-16';
    const bytes = Buffer.from(`<?xml version="1.0" encoding="${declaration}"?><x>ñ&amp;🙂</x>`, encoding);
    let result = '';
    const stream = createXmlStream({ text(value) { result += value; } });
    for (const byte of bytes) stream.write(Buffer.from([byte]));
    stream.end(); assert.equal(result, 'ñ&🙂');
  }
  const invalid = createXmlStream();
  assert.throws(() => { invalid.write(Buffer.from([60, 120, 62, 255, 60, 47, 120, 62])); invalid.end(); });
});

test('cancelación previa/durante XML y limpieza de lector/listeners', async () => {
  const original = yauzl.fromBufferPromise;
  let reader, stream;
  const controller = new AbortController();
  yauzl.fromBufferPromise = async (...args) => {
    reader = await original(...args);
    const open = reader.openReadStreamPromise.bind(reader);
    reader.openReadStreamPromise = async (entry, ...options) => {
      if (!entry.fileNameRaw.toString().endsWith('sheet1.xml')) return open(entry, ...options);
      stream = new PassThrough();
      stream.write(Buffer.from(`<worksheet xmlns="${MAIN_NS}"><sheetData>`));
      setImmediate(() => controller.abort());
      return stream;
    };
    return reader;
  };
  try { await assert.rejects(inspectXlsxXml(await makeZip(parts(), { compress: false }), { signal: controller.signal }), safeError()); }
  finally { yauzl.fromBufferPromise = original; }
  assert.equal(stream.destroyed, true); assert.equal(reader.isOpen, false);
  assert.equal(reader.reader.refCount, 0); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await assert.rejects(inspectXlsxXml(await makeZip(), { signal: AbortSignal.abort() }), safeError());
});

test('plazo compartido cancela XML detenido y limpia recursos', { timeout: 30000 }, async () => {
  const original = yauzl.fromBufferPromise;
  let reader, stream;
  yauzl.fromBufferPromise = async (...args) => {
    reader = await original(...args);
    const open = reader.openReadStreamPromise.bind(reader);
    reader.openReadStreamPromise = async (entry, ...options) => {
      if (!entry.fileNameRaw.toString().endsWith('sheet1.xml')) return open(entry, ...options);
      stream = new PassThrough();
      stream.write(Buffer.from(`<worksheet xmlns="${MAIN_NS}"><sheetData>`));
      return stream;
    };
    return reader;
  };
  try { await assert.rejects(inspectXlsxXml(await makeZip(parts(), { compress: false })), safeError(408)); }
  finally { yauzl.fromBufferPromise = original; }
  assert.equal(stream.destroyed, true); assert.equal(reader.isOpen, false); assert.equal(reader.reader.refCount, 0);
});

test('error XML limpia recursos y el contrato exclusivamente ZIP se conserva', async () => {
  const original = yauzl.fromBufferPromise, readers = [];
  yauzl.fromBufferPromise = async (...args) => { const reader = await original(...args); readers.push(reader); return reader; };
  try {
    const input = parts(); input[4][1] = '<dato_privado'; const zip = await makeZip(input);
    assert.equal((await inspectXlsxZip(zip)).entries, 5);
    for (let i = 0; i < 3; i++) await assert.rejects(inspectXlsxXml(zip), safeError());
  } finally { yauzl.fromBufferPromise = original; }
  for (const reader of readers) {
    assert.equal(reader.isOpen, false); assert.equal(reader.reader.refCount, 0);
    for (const event of ['entry', 'end', 'error']) assert.equal(reader.listenerCount(event), 0);
  }
  assert.deepEqual(cellCoordinate('DX4096'), { row: 4096, column: 128 });
});
