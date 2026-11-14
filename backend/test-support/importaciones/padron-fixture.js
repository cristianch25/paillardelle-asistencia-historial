import { makeZip, minimalParts } from './zip-fixture.js';

// Encabezados estructurales verificados. Todos los valores de registros son
// ficticios; no se importa el padrón institucional ni se depende de él en tests.
const grouped = { B: 'ITEM', C: 'ESTUDIANTE', T: 'PADRE', AK: 'MADRE', AS: 'APODERADO' };
const headers = { C: 'GRADO', D: 'SECCIÓN', E: 'TIPO DE DOCUMENTO', F: 'NÙMERO DE DOCUMENTO',
  G: 'VALIDADO CON RENIEC', H: 'CÓDIGO DEL ESTUDIANTE', I: 'APELLIDO PATERNO', J: 'APELLIDO MATERNO',
  K: 'NOMBRES', L: 'SEXO', N: 'FECHA DE NACIMIENTO', P: 'EDAD AL (31 DE MARZO)', R: 'ESTADO DE MATRICULA',
  T: 'APELLIDOS Y NOMBRES', Y: 'SEXO', AB: 'PARENTESCO', AF: 'TIPO DE DE DOCUMENTO', AG: 'NÚMERO',
  AH: 'VALIDADO CON RENIEC', AI: 'CORREO ELECTRÓNICO', AJ: 'NÚMERO CELULAR', AK: 'APELLIDOS Y NOMBRES',
  AL: 'SEXO', AM: 'PARENTESCO', AN: 'TIPO DE DOCUMENTO', AO: 'NÚMERO DE DOCUMENTO',
  AP: 'VALIDADO CON RENIEC', AQ: 'CORREO ELECTRÓNICO', AR: 'NÚMERO CELULAR', AS: 'APELLIDOS Y NOMBRES',
  AT: 'SEXO', AU: 'PARENTESCO', AV: 'TIPO DE DOCUMENTO', AW: 'NÚMERO DE DOCUMENTO',
  AX: 'VALIDADO CON RENIEC', AY: 'CORREO ELECTRÓNICO', AZ: 'NÚMERO CELULAR' };
const merges = ['C11:S11', 'T11:AJ11', 'AK11:AR11', 'AS11:AZ11', 'L12:M12', 'N12:O12',
  'P12:Q12', 'R12:S12', 'T12:X12', 'Y12:AA12', 'AB12:AE12'];
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relations = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const column = letters => [...letters].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);

function row(number, values) {
  return `<row r="${number}">` + Object.entries(values).sort(([a], [b]) => column(a) - column(b))
    .filter(([, value]) => value !== null && value !== undefined).map(([letter, value]) =>
      `<c r="${letter}${number}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`).join('') + '</row>';
}
function fictitiousRecord(index, level) {
  return { B: String(index + 1), C: level === 'INICIAL' ? '4 AÑOS' : '1', D: 'A', E: 'DNI',
    F: String(index + 1).padStart(8, '0'), H: String(index + 1).padStart(12, '0'),
    I: 'Ficticio', J: 'Ejemplo', K: 'Estudiante de prueba', R: 'MATRICULADO',
    T: 'Padre ficticio excluido', AJ: '999111222', AK: 'Madre ficticia excluida', AR: '999333444',
    AS: 'Apoderado ficticio', AU: 'TUTOR', AV: 'DNI', AW: '00999999', AZ: '999555666' };
}

export function padronParts({ level = 'INICIAL', counts = [1], records, fieldOverrides = {}, groupOverrides = {},
  context = { Q3: 'RELACIÓN DE ESTUDIANTES Y APODERADOS - 2027', U7: 'NIVEL', U8: level }, extraRows = [], extraMerges = [] } = {}) {
  const parts = minimalParts.slice(0, 4).map(([name, value]) => [name, value]);
  const sheets = counts.map((count, sheet) => {
    const data = records ?? Array.from({ length: count }, (_, index) => ({ values: fictitiousRecord(index, level) }));
    const contextRows = new Map();
    for (const [reference, value] of Object.entries(context)) {
      const [, letter, number] = /^([A-Z]+)(\d+)$/.exec(reference);
      if (!contextRows.has(Number(number))) contextRows.set(Number(number), {});
      contextRows.get(Number(number))[letter] = value;
    }
    const rows = [...contextRows].map(([number, values]) => [number, values]);
    rows.push([11, { ...grouped, ...groupOverrides }], [12, { ...headers, ...fieldOverrides }]);
    data.forEach((record, index) => rows.push([record.number ?? index + 13,
      { ...fictitiousRecord(index, level), ...record.values }]));
    for (const record of extraRows) rows.push([record.number, record.values]);
    const xml = `<worksheet xmlns="${main}"><sheetData>` + rows.sort(([a], [b]) => a - b)
      .map(([number, values]) => row(number, values)).join('') + '</sheetData><mergeCells>'
      + [...merges, ...extraMerges].map(ref => `<mergeCell ref="${ref}"/>`).join('') + '</mergeCells></worksheet>';
    return { name: sheet ? `Padron ficticio ${sheet + 1}` : 'rptPadresFamiliaEstudiantes', xml };
  });
  parts[2][1] = `<workbook xmlns="${main}" xmlns:r="${relations}"><sheets>` + sheets.map((sheet, i) =>
    `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
  parts[3][1] = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${relations}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>';
  for (const [index, sheet] of sheets.entries()) {
    if (index) parts[0][1] = parts[0][1].replace('</Types>', `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    parts.push([`xl/worksheets/sheet${index + 1}.xml`, sheet.xml]);
  }
  return parts;
}
export const makePadron = options => makeZip(padronParts(options));
