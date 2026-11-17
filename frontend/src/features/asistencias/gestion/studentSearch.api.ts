import { httpClient } from '../../../shared/api/httpClient';
import { getAttendance } from '../asistencias.api';
import { correctionStates } from '../supervision/supervisionCorrection';
import { validCivilDate } from '../../../shared/dates/civilDate';
import { educationLevelLabels } from '../../organizacion-escolar/secciones/sectionPresentation';
import { searchRowKey } from './studentSearch.types';
import type { StudentSearchResponse, StudentSearchRow } from './studentSearch.types';

export const normalizedSearchQuery = (q: string) => q.trim().replace(/\s+/gu, ' ');
export function validSearchQuery(q: string) {
  return [...q].length <= 120 && !/[\uD800-\uDFFF]/u.test(q)
    && ![...q].some(char => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127);
}
const id = (value: unknown) => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const version = (value: unknown, min: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= 4294967295;
function validRow(row: StudentSearchRow, date: string) {
  if (!row || row.fecha !== date || !id(row.estudiante?.id) || !id(row.matricula_id) || !id(row.matricula_seccion_id)
    || !id(row.anio_escolar?.id) || !Number.isInteger(row.anio_escolar.anio) || !id(row.seccion?.id)
    || !Object.hasOwn(educationLevelLabels, row.seccion.nivel) || !Number.isInteger(row.seccion.grado)
    || typeof row.seccion.letra !== 'string' || typeof row.estudiante.nombres !== 'string'
    || typeof row.estudiante.apellido_paterno !== 'string'
    || (row.estudiante.apellido_materno !== null && typeof row.estudiante.apellido_materno !== 'string')
    || (row.estudiante.codigo_estudiante !== null && typeof row.estudiante.codigo_estudiante !== 'string')) return false;
  if (row.situacion === 'SIN_SESION') return row.estado === null && row.sesion_id === null && row.sesion_estado === null
    && row.sesion_version === null && row.asistencia_id === null && row.asistencia_version === null;
  if (!id(row.sesion_id) || !version(row.sesion_version, 1) || !['ABIERTA', 'CERRADA'].includes(row.sesion_estado!)) return false;
  if (row.situacion === 'SIN_ASISTENCIA') return row.estado === null && row.asistencia_id === null && row.asistencia_version === null;
  return row.situacion === 'CON_REGISTRO' && id(row.asistencia_id) && version(row.asistencia_version, 0)
    && correctionStates.some(([value]) => value === row.estado);
}
export function canUpdateSearchRow(row: StudentSearchRow) {
  return row.situacion === 'CON_REGISTRO' && row.asistencia_id !== null && row.sesion_id !== null;
}
export async function searchAttendanceStudents(fecha: string, q: string, page: number): Promise<StudentSearchResponse> {
  if (!validCivilDate(fecha) || !validSearchQuery(q) || !Number.isSafeInteger(page) || page < 1) throw new Error('Búsqueda inválida.');
  const { data } = await httpClient.get<StudentSearchResponse>('/asistencias/busqueda-estudiantes', { params: { fecha, q, page, limit: 20 } });
  if (data.fecha !== fecha || data.q !== normalizedSearchQuery(q) || !Array.isArray(data.resultados)
    || data.pagination.page !== page || data.pagination.limit !== 20 || typeof data.pagination.has_more !== 'boolean'
    || data.resultados.length > 20 || (data.pagination.has_more && data.resultados.length === 0)
    || data.resultados.some(row => !validRow(row, fecha))
    || new Set(data.resultados.map(searchRowKey)).size !== data.resultados.length) throw new Error('Respuesta de búsqueda incompatible.');
  return data;
}
export async function getSearchCorrectionDetail(row: StudentSearchRow) {
  if (!canUpdateSearchRow(row)) throw new Error('Este resultado no tiene una asistencia existente para actualizar.');
  const data = await getAttendance(row.sesion_id!);
  const current = data.padron.find(item => item.asistencia_id === row.asistencia_id);
  if (data.sesion.id !== row.sesion_id || data.sesion.seccion_id !== row.seccion.id || data.sesion.fecha !== row.fecha
    || data.sesion.anio_escolar_id !== row.anio_escolar.id || data.sesion.version !== row.sesion_version
    || data.sesion.estado !== row.sesion_estado || !current || current.matricula_id !== row.matricula_id
    || current.matricula_seccion_id !== row.matricula_seccion_id || current.estudiante.id !== row.estudiante.id
    || current.version !== row.asistencia_version || current.estado !== row.estado) {
    throw new Error('Los datos cambiaron o no corresponden a la selección. Actualiza los resultados antes de continuar.');
  }
  return data;
}
