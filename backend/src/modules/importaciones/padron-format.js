import { HttpError } from '../../shared/http-error.js';
import { cellRange } from './worksheet-coordinates.js';

export const GROUP_ROW = 11, FIELD_ROW = 12, FIRST_DATA_ROW = 13;
export const GROUP_LABELS = ['ESTUDIANTE', 'PADRE', 'MADRE', 'APODERADO'];
// Encabezados comprobados en la referencia institucional. Las tildes y saltos
// de línea se comparan normalizados; nunca se normalizan así los datos personales.
export const fieldHeaders = {
  estudiante: { codigo_estudiante: 'CODIGO DEL ESTUDIANTE', tipo_documento: 'TIPO DE DOCUMENTO',
    numero_documento: 'NUMERO DE DOCUMENTO', apellido_paterno: 'APELLIDO PATERNO',
    apellido_materno: 'APELLIDO MATERNO', nombres: 'NOMBRES', estado_matricula: 'ESTADO DE MATRICULA',
    grado_edad: 'GRADO', seccion: 'SECCION' },
  apoderado: { nombres_apellidos: 'APELLIDOS Y NOMBRES', tipo_documento: 'TIPO DE DOCUMENTO',
    numero_documento: 'NUMERO DE DOCUMENTO', parentesco: 'PARENTESCO', telefonos_originales: 'NUMERO CELULAR' },
};
export const headerText = value => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase() : '';
export const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';
export function formatError(sheet, references = []) {
  const error = new HttpError(400, 'Encabezados del padrón ausentes, ambiguos o incompatibles.');
  // Solo coordenadas técnicas: no incorporar valores de celdas en el error.
  error.details = { hoja_indice: sheet.index, coordenadas: references };
  return error;
}

export function recognizePadron(sheet) {
  const grouped = sheet.rows.find(row => row.number === GROUP_ROW)?.cells ?? [];
  const found = grouped.filter(cell => GROUP_LABELS.includes(headerText(cell.value)));
  if (sheet.name !== 'rptPadresFamiliaEstudiantes' && found.length < 2) return null;
  const headers = sheet.rows.find(row => row.number === FIELD_ROW)?.cells ?? [];
  const ordered = GROUP_LABELS.map(label => {
    const matches = found.filter(cell => headerText(cell.value) === label);
    if (matches.length !== 1) throw formatError(sheet, matches.map(cell => cell.reference));
    return matches[0];
  });
  if (ordered.some((cell, index) => index && cell.column <= ordered[index - 1].column)) throw formatError(sheet);
  const ranges = sheet.merges.map(cellRange);
  const mapping = {};
  for (const [entity, blockIndex] of [['estudiante', 0], ['apoderado', 3]]) {
    const start = ordered[blockIndex].column, next = ordered[blockIndex + 1]?.column ?? 129;
    const merge = ranges.find(range => range.start.row === GROUP_ROW && range.start.column === start);
    if (merge && (merge.end.row !== GROUP_ROW || merge.end.column >= next)) throw formatError(sheet);
    const end = merge?.end.column ?? next - 1;
    mapping[entity] = Object.fromEntries(Object.entries(fieldHeaders[entity]).map(([key, label]) => {
      const matches = headers.filter(cell => cell.column >= start && cell.column <= end && headerText(cell.value) === label);
      if (matches.length !== 1) throw formatError(sheet, matches.map(cell => cell.reference));
      return [key, matches[0].column];
    }));
  }
  const items = grouped.filter(cell => headerText(cell.value) === 'ITEM');
  if (items.length !== 1) throw formatError(sheet, items.map(cell => cell.reference));
  return { ...mapping, item: items[0]?.column, groups: ordered.map(cell => cell.column), headers };
}

export function academicContext(sheet) {
  const cells = sheet.rows.filter(row => row.number < GROUP_ROW).flatMap(row => row.cells);
  const years = cells.flatMap(cell => {
    const match = /^RELACION DE ESTUDIANTES Y APODERADOS\s*-\s*(\d{4})$/.exec(headerText(cell.value));
    return match ? [{ value: match[1], cell }] : [];
  });
  const levels = cells.filter(cell => headerText(cell.value).replace(/:$/, '') === 'NIVEL').flatMap(label => {
    const cell = cells.find(cell => cell.row === label.row + 1 && cell.column === label.column);
    return cell && hasValue(cell.value) ? [{ value: String(cell.value), cell }] : [];
  });
  return Object.fromEntries([['anio', years], ['nivel', levels]].map(([field, matches]) => {
    const unique = new Set(matches.map(match => match.value));
    return [field, { value: unique.size === 1 ? matches[0].value : null,
      sources: matches.map(({ cell }) => ({ coordenada: cell.reference, valor_original: cell.value })),
      issue: unique.size > 1 ? 'CONTEXTO_AMBIGUO' : unique.size === 0 ? 'CONTEXTO_AUSENTE' : null }];
  }));
}
