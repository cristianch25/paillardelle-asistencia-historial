import { HttpError } from '../../shared/http-error.js';
import { validateId, validatePagination } from '../../shared/query-validation.js';
import { validDate } from '../../shared/date-validation.js';
import { educationLevels } from '../../shared/education-levels.js';
import { sourceLevel } from './source-mapping.js';
import { selectablePreviewRow } from './preview-eligibility.js';

export function previewSelection(query) {
  if (!query || Object.keys(query).some(key => !['anio_escolar_id', 'nivel', 'fecha_ingreso'].includes(key))) {
    throw new HttpError(400, 'Selección de importación inválida.');
  }
  validateId(query.anio_escolar_id);
  if (!educationLevels.includes(query.nivel) || !validDate(query.fecha_ingreso)) {
    throw new HttpError(400, 'Selecciona un nivel y una fecha efectiva válidos.');
  }
  return { anio_escolar_id: query.anio_escolar_id, nivel: query.nivel, fecha_ingreso: query.fecha_ingreso };
}
export function validateFileLevel(extracted, level) {
  if (!extracted.registros.length) throw new HttpError(400, 'El padrón no contiene estudiantes.');
  if (extracted.registros.some(row => sourceLevel(row.contexto?.nivel) !== level)) {
    throw new HttpError(400, 'El nivel real del archivo no corresponde al nivel seleccionado o es ambiguo.');
  }
}
export function previewPage(query) {
  if (Object.keys(query).some(key => !['page', 'limit'].includes(key))) throw new HttpError(400, 'Consulta de vista previa inválida.');
  return validatePagination(query);
}
export function selectedRows(body, plan) {
  if (!body || Object.keys(body).length !== 1 || !Array.isArray(body.filas) || body.filas.length > 2000
    || new Set(body.filas).size !== body.filas.length
    || body.filas.some(id => typeof id !== 'string' || !plan.registros.some(row => row.id === id && selectablePreviewRow(row, plan)))) {
    throw new HttpError(400, 'Selecciona únicamente filas válidas de esta vista previa.');
  }
  return [...body.filas];
}
