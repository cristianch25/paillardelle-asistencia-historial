import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractStudents } from '../src/modules/importaciones/student-extraction.js';
import { inspectXlsxXml } from '../src/modules/importaciones/xml-inspection.js';
import { HttpError } from '../src/shared/http-error.js';
import { padronParts } from '../test-support/importaciones/padron-fixture.js';
import { makeZip } from '../test-support/importaciones/zip-fixture.js';

const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const mc = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const x14 = 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main';
const x15 = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main';
const ac = 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac';
const path = `<mc:AlternateContent xmlns:mc="${mc}" xmlns:x15="${x15}" xmlns:ac="${ac}"><mc:Choice Requires="x15"><ac:absPath url="C:\\Ficticio\\"/></mc:Choice></mc:AlternateContent>`;
const slicer = `<ext uri="{EB79DEF2-80B8-43e5-95BD-54CBDDF9020C}"><x:slicerStyles xmlns:x="${x14}" defaultSlicerStyle="SlicerStyleLight1"/></ext>`;
const timeline = `<ext uri="{9260A510-F301-46a8-8635-F512D64BE5F5}"><x:timelineStyles xmlns:x="${x15}" defaultTimelineStyle="TimeSlicerStyleLight1"/></ext>`;
const extensions = `<extLst>${slicer}${timeline}</extLst>`;
const revisionNs = 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision';
const revision = `<r:revisionPtr xmlns:r="${revisionNs}" xmlns:r6="http://schemas.microsoft.com/office/spreadsheetml/2016/revision6"`
  + ' xmlns:r10="http://schemas.microsoft.com/office/spreadsheetml/2016/revision10" revIDLastSave="0"'
  + ' documentId="8_{00000000-0000-0000-0000-000000000001}" r6:coauthVersionLast="1" r6:coauthVersionMax="2"'
  + ' r10:uidLastSave="{00000000-0000-0000-0000-000000000002}"/>';

function parts({ workbook = path, styles = extensions } = {}) {
  const input = padronParts();
  input[2][1] = input[2][1].replace('</workbook>', workbook + '</workbook>');
  input[0][1] = input[0][1].replace('</Types>', '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  input[3][1] = input[3][1].replace('</Relationships>', '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  input.push(['xl/styles.xml', `<styleSheet xmlns="${main}"><cellXfs count="1"><xf/></cellXfs>${styles}</styleSheet>`]);
  return input;
}
const rejected = async input => assert.rejects(inspectXlsxXml(await makeZip(input)), error => {
  assert.ok(error instanceof HttpError); assert.equal(error.status, 400);
  assert.doesNotMatch(error.message, /Ficticio|C:|https:|\.xml|saxes/i); return true;
});

test('metadatos autorizados no cambian la extracción ni los contadores de hojas/celdas', async () => {
  const input = await makeZip(parts());
  const actual = await extractStudents(input), expected = await extractStudents(await makeZip(padronParts()));
  assert.deepEqual(actual, expected);
  assert.equal((await inspectXlsxXml(input)).sheets, 1);
});

test('solo slicerStyles o solo timelineStyles también son pasivos', async () => {
  for (const entry of [slicer, timeline]) await inspectXlsxXml(await makeZip(parts({ styles: `<extLst>${entry}</extLst>` })));
});

test('revisionPtr exacto es pasivo y no cambia la extracción', async () => {
  const result = await extractStudents(await makeZip(parts({ workbook: path + revision })));
  assert.deepEqual(result, await extractStudents(await makeZip(padronParts())));
});

for (const workbook of [
  revision.replace(revisionNs, 'urn:falso'),
  revision.replace('2016/revision6', '2016/incorrecto'),
  revision.replace('revIDLastSave="0"', 'revIDLastSave="1.5"'),
  revision.replace('documentId="8_', 'documentId="https://example.invalid/'),
  revision.replace('coauthVersionMax="2"', 'otro="2"'),
  revision.replace('/>', '><sheet xmlns="' + main + '"/></r:revisionPtr>'),
  revision.replace('/>', '>texto</r:revisionPtr>'),
  revision + revision,
]) test('revisionPtr con namespace, atributos o contenido no autorizado se rechaza', () => rejected(parts({ workbook })));

for (const workbook of [
  path.replace(ac, 'urn:falso'), path.replace(x15, 'urn:falso'),
  path.replace('Requires="x15"', 'Requires="desconocido"'),
  path.replace('Requires="x15"', 'Requires="x15 otro"'),
  path.replace('Requires="x15"', 'Requires="" xmlns="' + x15 + '"'),
  path.replace('<ac:absPath', '<ac:otro'),
  path.replace('C:\\Ficticio\\', 'https://example.invalid/privado'),
  path.replace('/></mc:Choice>', '><oleObjects xmlns="' + main + '"/></ac:absPath></mc:Choice>'),
  path.replace('</mc:Choice>', '<ac:absPath url="C:\\Otro\\"/></mc:Choice>'),
  path.replace('</mc:AlternateContent>', '<mc:Fallback/></mc:AlternateContent>'),
  path.replace('Requires="x15"', 'Requires="x15" extra="1"'),
  path.replace(/<ac:absPath[^>]+\/>/, ''), path + path,
]) test('AlternateContent desconocido, activo, externo o ambiguo sigue rechazado', () => rejected(parts({ workbook })));

for (const styles of [
  extensions.replace('EB79DEF2', 'FFFFFFFF'),
  extensions.replace(x14, 'urn:falso'),
  extensions.replace('slicerStyles', 'otro'),
  extensions.replace('defaultSlicerStyle="SlicerStyleLight1"', 'defaultSlicerStyle="SlicerStyleLight1" id="otro"'),
  extensions.replace('/></ext>', '><xf/></x:slicerStyles></ext>'),
  `<extLst>${slicer}${slicer}</extLst>`, '<extLst/>', extensions + extensions,
]) test('extensiones desconocidas, atributos extra o contenido oculto siguen rechazados', () => rejected(parts({ styles })));

test('los elementos autorizados se rechazan en otras ubicaciones', async () => {
  const input = parts({ workbook: '', styles: '' });
  input[4][1] = input[4][1].replace('</worksheet>', path + '</worksheet>');
  await rejected(input);
  const other = parts({ workbook: '', styles: '' });
  other[2][1] = other[2][1].replace('</workbook>', extensions + '</workbook>');
  await rejected(other);
  const wrongRevision = parts();
  wrongRevision[4][1] = wrongRevision[4][1].replace('</worksheet>', revision + '</worksheet>');
  await rejected(wrongRevision);
});

test('contenido activo y relaciones externas siguen rechazados junto a metadatos admitidos', async () => {
  const active = parts(); active[4][1] = active[4][1].replace('</worksheet>', '<oleObjects/></worksheet>');
  await rejected(active);
  const external = parts(); external[3][1] = external[3][1].replace('Target="worksheets/', 'TargetMode="External" Target="worksheets/');
  await rejected(external);
});
