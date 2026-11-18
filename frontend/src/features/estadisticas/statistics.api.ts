import { httpClient } from '../../shared/api/httpClient';
import type { AttendanceStatistics, StatisticsQuery } from './statistics.types';

export async function getAttendanceStatistics(query: StatisticsQuery, signal?: AbortSignal): Promise<AttendanceStatistics> {
  const { data } = await httpClient.get<AttendanceStatistics>('/asistencias/estadisticas', { params: query, signal });
  const counts = data.totales;
  if (!counts || ![counts.presentes, counts.tardanzas, counts.faltas, counts.pendientes,
    data.marcas_registradas, data.sesiones_con_registro].every(value => Number.isSafeInteger(value) && value >= 0)
    || data.marcas_registradas !== counts.presentes + counts.tardanzas + counts.faltas
    || !Number.isSafeInteger(data.marcas_registradas + counts.pendientes)
    || (!data.sesiones_con_registro && data.marcas_registradas + counts.pendientes !== 0)
    || data.filtros?.anio_escolar_id !== query.anio_escolar_id || data.filtros.fecha_desde !== query.fecha_desde
    || data.filtros.fecha_hasta !== query.fecha_hasta || data.filtros.nivel !== (query.nivel ?? null)
    || !Array.isArray(data.niveles_autorizados)
    || data.niveles_autorizados.some(level => !['INICIAL', 'PRIMARIA', 'SECUNDARIA'].includes(level))
    || new Set(data.niveles_autorizados).size !== data.niveles_autorizados.length
    || (query.nivel && !data.niveles_autorizados.includes(query.nivel))) {
    throw new Error('La respuesta de estadísticas es inconsistente.');
  }
  return data;
}
