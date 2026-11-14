import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectXlsxXml } from '../src/modules/importaciones/xml-inspection.js';
import { extractStudents } from '../src/modules/importaciones/student-extraction.js';
import { HttpError } from '../src/shared/http-error.js';
import { padronParts } from '../test-support/importaciones/padron-fixture.js';
import { makeZip } from '../test-support/importaciones/zip-fixture.js';

const base = 'http://schemas.openxmlformats.org/package/2006/relationships/';
const legacy = base + 'meatadata/core-properties';
const canonical = base + 'metadata/core-properties';
const coreType = 'application/vnd.openxmlformats-package.core-properties+xml';
const coreNs = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
function fixture({ type = legacy, target = 'docProps/core0.xml', mode = '', source = 1,
  contentType = coreType, xml = `<cp:coreProperties xmlns:cp="${coreNs}"/>` } = {}) {
  const parts = padronParts();
  // Reproduce los dos metadatos presentes en el archivo: relación canónica y
  // relación con errata rId4. El contenido de las propiedades es ficticio/vacío.
  parts[0][1] = parts[0][1].replace('</Types>', `<Override PartName="/docProps/core.xml" ContentType="${coreType}"/>`
    + `<Override PartName="/docProps/core0.xml" ContentType="${contentType}"/></Types>`);
  parts[1][1] = parts[1][1].replace('</Relationships>', `<Relationship Id="core" Type="${canonical}" Target="docProps/core.xml"/></Relationships>`);
  parts[source][1] = parts[source][1].replace('</Relationships>', `<Relationship Id="rId4" Type="${type}" Target="${target}" ${mode}/></Relationships>`);
  parts.push(['docProps/core.xml', `<coreProperties xmlns="${coreNs}"/>`], ['docProps/core0.xml', xml]);
  return parts;
}
const safeError = error => {
  assert.ok(error instanceof HttpError); assert.equal(error.status, 400);
  assert.doesNotMatch(error.message, /privado|\.xml|saxes|file:|https:/i);
  return true;
};

test('errata exacta de metadatos raíz supera inspección y extracción sin omitir controles', async () => {
  const zip = await makeZip(fixture());
  assert.equal((await inspectXlsxXml(zip)).sheets, 1);
  const result = await extractStudents(zip);
  assert.equal(result.registros.length, 1);
  assert.equal(result.registros[0].estudiante.codigo_estudiante, '000000000001');
});

test('metadatos canónicos mantienen compatibilidad', async () => {
  assert.equal((await inspectXlsxXml(await makeZip(fixture({ type: canonical })))).sheets, 1);
});

for (const options of [
  { type: base + 'metadata-desconocida/core-properties' },
  { type: base + 'meatadata/extended-properties' },
  { type: 'https://schemas.openxmlformats.org/package/2006/relationships/meatadata/core-properties' },
  { mode: 'TargetMode="External"' },
  { target: 'https://example.invalid/privado' },
  { target: '../docProps/core0.xml' },
  { target: 'docProps/%63ore0.xml' },
  { target: 'xl/workbook.xml' },
  { target: 'docProps/ausente.xml' },
  { source: 3, target: '../docProps/core0.xml' },
  { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' },
  { xml: `<coreProperties xmlns="urn:incorrecto"/>` },
  { xml: `<worksheet xmlns="${coreNs}"/>` },
  { xml: '<!DOCTYPE x [<!ENTITY secreto "privado">]><x>&secreto;</x>' },
  { xml: `<coreProperties xmlns="${coreNs}"><oleObjects/></coreProperties>` },
  { xml: '<coreProperties' },
]) test('la excepción acotada sigue rechazando destinos/tipos/XML peligrosos o incompatibles', async () => {
  await assert.rejects(inspectXlsxXml(await makeZip(fixture(options))), safeError);
});
