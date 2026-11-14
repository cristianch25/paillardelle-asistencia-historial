import { HttpError } from '../../shared/http-error.js';
import { readXlsx } from './xlsx-reader.js';
import { cellRange } from './worksheet-coordinates.js';
import { MAX_ZIP_INSPECTION_MS } from './limits.js';
import { academicContext, FIRST_DATA_ROW, GROUP_LABELS, hasValue, headerText, recognizePadron } from './padron-format.js';

const MAX_CANDIDATES = 2000; // T01, decisiones complementarias de importación v1.
const identityFields = ['codigo_estudiante', 'tipo_documento', 'numero_documento', 'apellido_paterno', 'apellido_materno', 'nombres'];
function observation(code, sheet, row, field, coordinates = []) {
  return { codigo: code, campo: field, origen: { hoja: sheet.name, hoja_id: sheet.sheetId, fila: row, coordenadas: coordinates } };
}
function repeatedHeader(row, mapping) {
  const populated = row.cells.filter(cell => hasValue(cell.value));
  const labels = new Map(mapping.headers.map(cell => [cell.column, headerText(cell.value)]));
  return populated.length >= 2 && populated.every(cell => headerText(cell.value) === labels.get(cell.column)
    || (cell.column === mapping.item && headerText(cell.value) === 'ITEM'));
}
function rowKind(row, mapping, merges) {
  const cells = new Map(row.cells.map(cell => [cell.column, cell]));
  if (!row.cells.some(cell => hasValue(cell.value))) return 'empty';
  if (repeatedHeader(row, mapping)) return 'header';
  if (mapping.groups.every((column, index) => headerText(cells.get(column)?.value) === GROUP_LABELS[index])
    && row.cells.filter(cell => hasValue(cell.value)).every(cell => mapping.groups.includes(cell.column)
      || (cell.column === mapping.item && headerText(cell.value) === 'ITEM'))) return 'header';
  const identity = identityFields.some(key => hasValue(cells.get(mapping.estudiante[key])?.value));
  const student = Object.values(mapping.estudiante).some(column => hasValue(cells.get(column)?.value));
  const contact = Object.values(mapping.apoderado).some(column => hasValue(cells.get(column)?.value));
  const item = /^\d+$/.test(String(cells.get(mapping.item)?.value ?? '').trim());
  if (!identity && !contact && !item && row.cells.filter(cell => hasValue(cell.value)).length === 1
    && merges.some(range => range.start.row === row.number && range.end.column > range.start.column)) return 'separator';
  return student || contact || item ? 'candidate' : 'unrecognized';
}

function extractRecord(sheet, row, mapping, context) {
  const cells = new Map(row.cells.map(cell => [cell.column, cell])), sources = {}, observations = [];
  function entityValues(entity) {
    return Object.fromEntries(Object.entries(mapping[entity]).map(([field, column]) => {
      const cell = cells.get(column), key = `${entity === 'estudiante' && ['grado_edad', 'seccion'].includes(field) ? 'contexto' : entity}.${field}`;
      let letters = '', value = column;
      while (value) { value--; letters = String.fromCharCode(65 + value % 26) + letters; value = Math.floor(value / 26); }
      const reference = cell?.reference ?? `${letters}${row.number}`;
      sources[key] = { coordenada: reference, tipo: cell?.type ?? null, valor_literal: cell?.rawValue ?? null,
        formato_numerico: cell?.numberFormat ?? null, formula: cell?.formula ?? false };
      if (cell?.formula) observations.push(observation('VALOR_DE_FORMULA', sheet, row.number, key, [reference]));
      if (cell && !['s', 'inlineStr', 'str'].includes(cell.type) && hasValue(cell.value)) {
        observations.push(observation('TIPO_ORIGINAL_REQUIERE_REVISION', sheet, row.number, key, [reference]));
      }
      for (const issue of cell?.issues ?? []) observations.push(observation(issue, sheet, row.number, key, [reference]));
      return [field, cell?.value === null || cell?.value === undefined ? null : String(cell.value)];
    }));
  }
  const student = entityValues('estudiante'), contact = entityValues('apoderado');
  if (!hasValue(student.codigo_estudiante) && !hasValue(student.numero_documento)) {
    observations.push(observation('IDENTIFICACION_ESTUDIANTE_INCOMPLETA', sheet, row.number, 'estudiante',
      [sources['estudiante.codigo_estudiante'].coordenada, sources['estudiante.numero_documento'].coordenada]));
  }
  for (const [entity, values] of [['estudiante', student], ['apoderado', contact]]) {
    if (hasValue(values.tipo_documento) !== hasValue(values.numero_documento)) {
      observations.push(observation('DOCUMENTO_INCOMPLETO', sheet, row.number, entity,
        [sources[`${entity}.tipo_documento`].coordenada, sources[`${entity}.numero_documento`].coordenada]));
    }
  }
  if (!hasValue(student.nombres)) observations.push(observation('NOMBRES_ESTUDIANTE_AUSENTES', sheet, row.number,
    'estudiante.nombres', [sources['estudiante.nombres'].coordenada]));
  const { grado_edad, seccion, ...identity } = student;
  return { estudiante: identity, apoderado: contact,
    contexto: { anio: context.anio.value, nivel: context.nivel.value, grado_edad, seccion },
    origen: { hoja: sheet.name, hoja_id: sheet.sheetId, fila: row.number, campos: sources, contexto: context },
    observaciones: observations };
}

/** Único extractor funcional. No consulta BD, no concilia identidades y no
 * interpreta estados como operaciones de matrícula. Valores y teléfonos intactos.
 */
export function extractStudentRows(technical, { signal, deadline = performance.now() + MAX_ZIP_INSPECTION_MS } = {}) {
  const records = [], observations = [];
  let recognized = 0;
  function check() {
    if (signal?.aborted) throw new HttpError(400, 'Extracción cancelada.');
    if (performance.now() >= deadline) throw new HttpError(408, 'La extracción superó el plazo permitido.');
  }
  check();
  for (const sheet of technical.sheets) {
    const mapping = recognizePadron(sheet);
    if (!mapping) continue;
    recognized++;
    const context = academicContext(sheet), merges = sheet.merges.map(cellRange);
    for (const [field, info] of Object.entries(context)) if (info.issue) {
      observations.push(observation(info.issue, sheet, null, `contexto.${field}`, info.sources.map(source => source.coordenada)));
    }
    for (const row of sheet.rows.filter(row => row.number >= FIRST_DATA_ROW)) {
      check();
      const kind = rowKind(row, mapping, merges);
      if (kind === 'empty') continue;
      if (kind !== 'candidate') {
        observations.push(observation(kind === 'header' ? 'ENCABEZADO_REPETIDO' : 'FILA_NO_ESTUDIANTE', sheet, row.number,
          null, row.cells.filter(cell => hasValue(cell.value)).map(cell => cell.reference)));
        continue;
      }
      if (records.length >= MAX_CANDIDATES) throw new HttpError(413, 'El padrón supera los 2.000 registros candidatos permitidos.');
      records.push(extractRecord(sheet, row, mapping, context));
    }
  }
  if (!recognized) throw new HttpError(400, 'No se encontró una hoja con el formato de padrón admitido.');
  check();
  return { registros: records, observaciones: observations };
}

export async function extractStudents(input, { signal } = {}) {
  const deadline = performance.now() + MAX_ZIP_INSPECTION_MS;
  const technical = await readXlsx(input, { signal });
  return extractStudentRows(technical, { signal, deadline });
}
