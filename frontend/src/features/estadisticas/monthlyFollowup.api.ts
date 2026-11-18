import { httpClient } from '../../shared/api/httpClient';
import { validCivilDate } from '../../shared/dates/civilDate';
import type { MonthlyFollowupQuery, MonthlyFollowupResponse } from './monthlyFollowup.types';

const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
export async function getMonthlyFollowup(query: MonthlyFollowupQuery, signal?: AbortSignal): Promise<MonthlyFollowupResponse> {
  const { data } = await httpClient.get<MonthlyFollowupResponse>('/asistencias/seguimiento-mensual', { params: query, signal });
  const filters = data.filtros, pagination = data.pagination;
  if (filters?.anio_escolar_id !== query.anio_escolar_id || filters.mes !== query.mes || filters.nivel !== (query.nivel ?? null)
    || !validCivilDate(filters.fecha_desde) || !validCivilDate(filters.fecha_hasta)
    || filters.fecha_desde > filters.fecha_hasta || filters.fecha_desde.slice(0, 7) !== query.mes || filters.fecha_hasta.slice(0, 7) !== query.mes
    || !Array.isArray(data.niveles_autorizados) || data.niveles_autorizados.some(level => !['INICIAL', 'PRIMARIA', 'SECUNDARIA'].includes(level))
    || (query.nivel && !data.niveles_autorizados.includes(query.nivel))
    || pagination?.page !== query.page || pagination.limit !== query.limit || !count(pagination.total)
    || !Array.isArray(data.estudiantes) || data.estudiantes.length !== Math.min(query.limit, Math.max(0, pagination.total - (query.page - 1) * query.limit))
    || pagination.has_more !== (query.page * query.limit < pagination.total)) throw new Error('Respuesta de seguimiento inconsistente.');
  const ids = new Set<string>();
  for (const row of data.estudiantes) {
    if (!row.estudiante || typeof row.estudiante.id !== 'string' || !/^[1-9]\d*$/.test(row.estudiante.id) || ids.has(row.estudiante.id)
      || typeof row.estudiante.nombres !== 'string' || typeof row.estudiante.apellido_paterno !== 'string'
      || (row.estudiante.apellido_materno !== null && typeof row.estudiante.apellido_materno !== 'string')
      || ![row.faltas, row.tardanzas, row.total, row.justificadas, row.injustificadas].every(count)
      || row.total < 3 || row.total !== row.faltas + row.tardanzas || row.total !== row.justificadas + row.injustificadas
      || !Array.isArray(row.secciones) || !row.secciones.length
      || new Set(row.secciones.map(section => section.id)).size !== row.secciones.length
      || row.secciones.some(section => typeof section.id !== 'string' || !/^[1-9]\d*$/.test(section.id) || !data.niveles_autorizados.includes(section.nivel)
        || (query.nivel && section.nivel !== query.nivel) || !Number.isInteger(section.grado) || typeof section.letra !== 'string')) {
      throw new Error('Fila de seguimiento inconsistente.');
    }
    ids.add(row.estudiante.id);
  }
  return data;
}
