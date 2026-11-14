import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import readExcel from 'read-excel-file/node';
import yazl from 'yazl';
import { readXlsx } from '../src/modules/importaciones/xlsx-reader.js';
import { inspectXlsxXml } from '../src/modules/importaciones/xml-inspection.js';
import { MAIN_NS, REL_NS } from '../src/modules/importaciones/xml-stream.js';
import { HttpError } from '../src/shared/http-error.js';
import { makeZip, minimalParts } from '../test-support/importaciones/zip-fixture.js';

function parts(body = '<sheetData/>') {
  return minimalParts.map(([name, xml]) => [name, name.endsWith('sheet1.xml')
    ? `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${body}</worksheet>` : xml]);
}
function auxiliary(input, kind, xml) {
  input[0][1] = input[0][1].replace('</Types>', `<Override PartName="/xl/${kind}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${kind}+xml"/></Types>`);
  input[3][1] = input[3][1].replace('</Relationships>', `<Relationship Id="${kind}" Type="${REL_NS}/${kind}" Target="${kind}.xml"/></Relationships>`);
  input.push([`xl/${kind}.xml`, xml]);
  return input;
}
const textCell = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
const safeError = (status = 400) => error => {
  assert.ok(error instanceof HttpError); assert.equal(error.status, status);
  assert.doesNotMatch(error.message, /dato_privado|\.xml|saxen|unexpected|namespace|read-excel|checksum/i);
  return true;
};
const cellAt = (result, reference) => result.sheets[0].rows.flatMap(row => row.cells).find(cell => cell.reference === reference);

test('paquete compatible: mismo Buffer, una lectura y contrato exclusivamente técnico', async () => {
  const zip = await makeZip(parts('<sheetData><row r="13">' + textCell('C13', '001234') + '</row></sheetData>'));
  let calls = 0;
  const result = await readXlsx(zip, {}, (input, options) => {
    calls++; assert.equal(input, zip); assert.equal(options.trim, false);
    assert.equal(options.parseNumber('00001234567890123456'), '00001234567890123456');
    return readExcel(input, options);
  });
  assert.equal(calls, 1); assert.equal(result.normalized, false);
  assert.equal(cellAt(result, 'C13').value, '001234');
  assert.deepEqual(Object.keys(result).sort(), ['inspection', 'normalized', 'sheets']);
  assert.equal(result.sheets[0].sheetId, '1'); assert.equal(result.sheets[0].relationshipId, 'rId1');
  assert.equal(result.sheets[0].path, 'xl/worksheets/sheet1.xml');
});

for (const target of ['../xl/worksheets/sheet1.xml', './worksheets/sheet1.xml', '/xl/worksheets/sheet1.xml']) {
  test(`relación interna ${target}: identidad y datos conservados`, async () => {
    const input = parts('<sheetData><row r="13">' + textCell('AS13', ' Ficticio &amp; ñ ') + '</row></sheetData>');
    input[3][1] = input[3][1].replace('worksheets/sheet1.xml', target);
    const zip = await makeZip(input), copy = Buffer.from(zip);
    const result = await readXlsx(zip, {}, async (prepared, options) => {
      await inspectXlsxXml(prepared); return readExcel(prepared, options);
    });
    assert.equal(result.normalized, !target.startsWith('/'));
    assert.equal(cellAt(result, 'AS13').value, ' Ficticio & ñ ');
    assert.deepEqual(zip, copy);
  });
}

for (const endian of ['LE', 'BE']) test(`UTF-16 ${endian} con BOM: normalización UTF-8 y XML revalidado`, async () => {
  const input = parts('<sheetData><row r="13">' + textCell('C13', '00ñ🙂') + '</row></sheetData>');
  for (const part of input) {
    const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-16"?>${part[1]}`, 'utf16le');
    part[1] = endian === 'LE' ? Buffer.concat([Buffer.from([255, 254]), bytes])
      : Buffer.concat([Buffer.from([254, 255]), bytes.swap16()]);
  }
  const result = await readXlsx(await makeZip(input));
  assert.equal(result.normalized, true); assert.equal(cellAt(result, 'C13').value, '00ñ🙂');
});

test('UTF-8 con BOM no necesita reconstrucción', async () => {
  const input = parts('<sheetData><row r="1">' + textCell('A1', '0001') + '</row></sheetData>');
  input[4][1] = Buffer.from('\ufeff' + input[4][1]);
  const result = await readXlsx(await makeZip(input));
  assert.equal(result.normalized, false); assert.equal(cellAt(result, 'A1').value, '0001');
});

test('prefijo legítimo de relaciones y xml:space se aceptan', async () => {
  const input = parts('<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve"> 001 </t></is></c></row></sheetData>');
  input[2][1] = input[2][1].replace('xmlns:r=', 'xmlns:enlace=').replace('r:id=', 'enlace:id=');
  const result = await readXlsx(await makeZip(input));
  assert.equal(result.normalized, false); assert.equal(cellAt(result, 'A1').value, ' 001 ');
});

test('colisiones de atributos al quitar prefijos se rechazan antes de leer', async () => {
  for (const ambiguous of [
    input => { input[2][1] = input[2][1].replace('sheetId="1"', 'xmlns:falso="urn:falso" falso:id="otro" sheetId="1"'); },
    input => { input[4][1] = input[4][1].replace('t="inlineStr"', 'xmlns:falso="urn:falso" falso:t="n" t="inlineStr"'); },
  ]) {
    const input = parts('<sheetData><row r="1">' + textCell('A1', 'dato_privado') + '</row></sheetData>');
    ambiguous(input); let called = false;
    await assert.rejects(readXlsx(await makeZip(input), {}, () => { called = true; }), safeError());
    assert.equal(called, false);
  }
});

test('combinaciones, huecos y filas finales vacías conservan coordenadas originales', async () => {
  const input = parts('<sheetData><row r="11">' + textCell('C11', 'Bloque ficticio') + '</row><row r="13">'
    + textCell('C13', '0001') + '</row><row r="17"/><row r="20"><c r="B20"/></row></sheetData>'
    + '<mergeCells><mergeCell ref="C11:S11"/></mergeCells>');
  const result = await readXlsx(await makeZip(input));
  assert.deepEqual(result.sheets[0].rows.map(row => row.number), [11, 13, 17, 20]);
  assert.deepEqual(result.sheets[0].merges, ['C11:S11']);
  assert.equal(cellAt(result, 'B20').value, null);
  assert.equal(cellAt(result, 'C13').column, 3);
  assert.equal(result.normalized, false);
});

test('filas implícitas vacías: se normalizan sin cambiar su origen', async () => {
  const result = await readXlsx(await makeZip(parts('<sheetData><row/><row>' + textCell('C13', '001') + '</row><row/></sheetData>')));
  assert.equal(result.normalized, true);
  assert.deepEqual(result.sheets[0].rows.map(row => row.number), [1, 13, 14]);
  assert.ok(result.sheets[0].rows.every(row => row.implicit));
  assert.equal(cellAt(result, 'C13').value, '001');
});

test('números grandes, máscara de ceros y fecha numérica no pierden su literal', async () => {
  const input = auxiliary(parts('<sheetData><row r="1"><c r="A1"><v>00012345678901234567890</v></c>'
    + '<c r="B1" s="0"><v>123</v></c><c r="C1" s="1"><v>45292</v></c>'
    + '<c r="D1" t="d"><v>2026-01-01T00:00:00Z</v></c></row></sheetData>'), 'styles',
  `<styleSheet xmlns="${MAIN_NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="000000"/></numFmts>`
    + '<cellXfs count="2"><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>');
  const result = await readXlsx(await makeZip(input));
  assert.equal(cellAt(result, 'A1').value, '00012345678901234567890');
  assert.equal(cellAt(result, 'B1').value, '123');
  assert.deepEqual(cellAt(result, 'B1').numberFormat, { id: '164', code: '000000' });
  assert.equal(cellAt(result, 'C1').value, '45292');
  assert.equal(cellAt(result, 'D1').value, '2026-01-01T00:00:00Z');
});

test('errores y fórmulas sin resultado no desaparecen silenciosamente', async () => {
  const result = await readXlsx(await makeZip(parts('<sheetData><row r="1"><c r="A1" t="e"><v>#VALUE!</v></c>'
    + '<c r="B1" t="str"><f>1+1</f></c><c r="C1" t="str"><f>1</f><v>00_x0041_</v></c></row></sheetData>')));
  assert.equal(cellAt(result, 'A1').value, '#VALUE!');
  assert.deepEqual(cellAt(result, 'A1').issues, ['CELL_ERROR']);
  assert.ok(cellAt(result, 'B1').issues.includes('FORMULA_WITHOUT_CACHED_VALUE'));
  assert.equal(cellAt(result, 'C1').value, '00A');
});

test('cadenas compartidas, rich text, escapes y fonética conservan texto', async () => {
  const input = auxiliary(parts('<sheetData><row r="13"><c r="C13" t="s"><v>0</v></c>'
    + '<c r="D13" t="inlineStr"><is><r><t>00</t></r><r><t>123</t></r><rPh sb="0" eb="1"><t>ignorado</t></rPh></is></c>'
    + '</row></sheetData>'), 'sharedStrings', `<sst xmlns="${MAIN_NS}" uniqueCount="1"><si><t>00_x005F_x0041_</t></si></sst>`);
  const result = await readXlsx(await makeZip(input.reverse()));
  assert.equal(cellAt(result, 'C13').value, '00_x0041_');
  assert.equal(cellAt(result, 'D13').value, '00123');
});

test('texto largo partido entre chunks se entrega íntegro', async () => {
  const value = '00' + 'Ficticio'.repeat(20000);
  const result = await readXlsx(await makeZip(parts('<sheetData><row r="13">' + textCell('C13', value) + '</row></sheetData>')));
  assert.equal(cellAt(result, 'C13').value, value);
});

test('múltiples hojas: IDs no secuenciales, orden y visibilidad conservados', async () => {
  const input = parts('<sheetData/>');
  input[2][1] = input[2][1].replace('</sheets>', '<sheet name="Otra" sheetId="7" state="veryHidden" r:id="segunda"/></sheets>');
  input[0][1] = input[0][1].replace('</Types>', '<Override PartName="/xl/worksheets/otra.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  input[3][1] = input[3][1].replace('</Relationships>', `<Relationship Id="segunda" Type="${REL_NS}/worksheet" Target="worksheets/otra.xml"/></Relationships>`);
  input.push(['xl/worksheets/otra.xml', `<worksheet xmlns="${MAIN_NS}"><sheetData><row r="13">${textCell('A13', '002')}</row></sheetData></worksheet>`]);
  const result = await readXlsx(await makeZip(input));
  assert.deepEqual(result.sheets.map(sheet => [sheet.sheetId, sheet.index, sheet.state]), [['1', 1, 'visible'], ['7', 2, 'veryHidden']]);
  assert.equal(result.sheets[1].rows[0].number, 13);
});

test('paquete normalizado corrupto se rechaza antes de invocar el lector', async () => {
  const input = parts(); input[3][1] = input[3][1].replace('worksheets/', '../xl/worksheets/');
  const zip = await makeZip(input), Original = yazl.ZipFile;
  let called = false;
  yazl.ZipFile = function () {
    const writer = new Original(), add = writer.addBuffer.bind(writer);
    writer.addBuffer = (bytes, name) => add(name.endsWith('sheet1.xml') ? Buffer.from('<corrupto') : bytes, name);
    return writer;
  };
  try { await assert.rejects(readXlsx(zip, {}, () => { called = true; }), safeError()); }
  finally { yazl.ZipFile = Original; }
  assert.equal(called, false);
});

test('cancelación durante reconstrucción drena yazl y limpia listeners', async () => {
  const input = parts(); input[3][1] = input[3][1].replace('worksheets/', '../xl/worksheets/');
  const zip = await makeZip(input), Original = yazl.ZipFile, controller = new AbortController();
  let writer;
  yazl.ZipFile = function () {
    writer = new Original(); writer.outputStream.once('data', () => controller.abort()); return writer;
  };
  try { await assert.rejects(readXlsx(zip, { signal: controller.signal }), safeError()); }
  finally { yazl.ZipFile = Original; }
  assert.equal(writer.outputStream.destroyed, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  await readXlsx(zip);
});

test('presupuesto de salida comprimida se controla y termina la reconstrucción', async () => {
  const input = parts(); input[3][1] = input[3][1].replace('worksheets/', '../xl/worksheets/');
  const zip = await makeZip(input), Original = yazl.ZipFile;
  let writer, injected = false, called = false;
  yazl.ZipFile = function () {
    writer = new Original();
    writer.outputStream.prependListener('data', () => {
      if (!injected) { injected = true; writer.outputStream.emit('data', Buffer.alloc(5000001)); }
    });
    return writer;
  };
  try { await assert.rejects(readXlsx(zip, {}, () => { called = true; }), safeError(413)); }
  finally { yazl.ZipFile = Original; }
  assert.equal(called, false); assert.equal(writer.outputStream.destroyed, true);
});

test('normalización UTF-16 no puede superar los 50 MB reales de salida', async () => {
  const input = parts('<sheetData><row r="1">' + textCell('A1', '漢'.repeat(16666667)) + '</row></sheetData>');
  input[4][1] = Buffer.from('<?xml version="1.0" encoding="UTF-16"?>' + input[4][1], 'utf16le');
  let called = false;
  await assert.rejects(readXlsx(await makeZip(input), {}, () => { called = true; }), safeError(413));
  assert.equal(called, false);
});

test('límites ZIP/OOXML y errores privados se preservan antes de materializar', async () => {
  for (const [input, status] of [[Buffer.alloc(5000001), 413], [Buffer.from('dato_privado'), 400],
    [await makeZip(parts('<sheetData><row><c r="DX4096"/></row></sheetData>')), 413]]) {
    let called = false;
    await assert.rejects(readXlsx(input, {}, () => { called = true; }), safeError(status));
    assert.equal(called, false);
  }
  await assert.rejects(readXlsx(await makeZip(), {}, () => { throw new Error('dato_privado'); }), safeError());
});

test('cancelación previa, en lectura y cupos retenidos hasta terminar el lector', async () => {
  const zip = await makeZip();
  await assert.rejects(readXlsx(zip, { signal: AbortSignal.abort() }), safeError());
  const controller = new AbortController(), releases = [];
  let notify;
  const ready = new Promise(resolve => { notify = resolve; });
  const read = () => new Promise(resolve => { releases.push(resolve); if (releases.length === 2) notify(); });
  const first = readXlsx(zip, { signal: controller.signal }, read);
  const firstError = assert.rejects(first, safeError());
  const second = readXlsx(zip, {}, read);
  await ready; controller.abort();
  await assert.rejects(readXlsx(zip), safeError(503));
  releases[0]([{ sheet: 'Ficticio', data: [] }]); await firstError;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  releases[1]([{ sheet: 'Ficticio', data: [] }]); await second;
  await readXlsx(zip);
});

test('plazo de 20 s incluye la lectura; no devuelve resultados vencidos', { timeout: 30000 }, async () => {
  const zip = await makeZip();
  let timer;
  try {
    await assert.rejects(readXlsx(zip, {}, () => new Promise(resolve => {
      timer = setTimeout(() => resolve([{ sheet: 'Ficticio', data: [] }]), 20050);
    })), safeError(408));
  } finally { clearTimeout(timer); }
  await readXlsx(zip);
});
