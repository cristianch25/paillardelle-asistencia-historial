import { validCivilDate } from '../../shared/dates/civilDate';
import { getAttendanceSupervision } from '../asistencias/supervision/supervision.api';
import type { SupervisionSection } from '../asistencias/supervision/supervision.types';
import { summarizeDay, type DailySummary } from './dailySummary';

export async function getDailySummary(yearId: string, fecha: string, current: () => boolean): Promise<DailySummary | null> {
  if (!yearId || !validCivilDate(fecha)) throw new Error('Año o fecha no válidos.');
  const rows: SupervisionSection[] = [];
  for (let page = 1; page <= 100; page++) {
    if (!current()) return null;
    const data = await getAttendanceSupervision({ anio_escolar_id: yearId, fecha, page, limit: 100 });
    if (!current()) return null;
    if (data.anio_escolar_id !== yearId || data.fecha !== fecha || data.pagination.page !== page
      || data.pagination.limit !== 100 || typeof data.pagination.has_more !== 'boolean'
      || !Array.isArray(data.secciones) || data.secciones.length > 100
      || (data.pagination.has_more && data.secciones.length === 0)) throw new Error('Listado diario incompleto.');
    rows.push(...data.secciones);
    if (!data.pagination.has_more) return summarizeDay(rows, yearId);
  }
  throw new Error('El listado diario supera el límite de carga.');
}
