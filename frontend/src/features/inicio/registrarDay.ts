// Reúne las secciones autorizadas para una fecha y determina su avance de asistencia.
import { getAttendanceSupervision } from '../asistencias/supervision/supervision.api';
import type { SupervisionSection } from '../asistencias/supervision/supervision.types';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { validCivilDate } from '../../shared/dates/civilDate';
import { summarizeDay } from './dailySummary';

export async function getRegistrarDay(years: SchoolYear[], date: string, current: () => boolean) {
  if (!validCivilDate(date)) throw new Error('Fecha no válida.');
  const result: SupervisionSection[] = [], ids = new Set<string>();
  for (const year of years.filter(row => date >= row.fecha_inicio && date <= row.fecha_fin)) {
    const rows: SupervisionSection[] = [];
    for (let page = 1; page <= 100; page++) {
      if (!current()) return null;
      const data = await getAttendanceSupervision({ anio_escolar_id: year.id, fecha: date, page, limit: 100 });
      if (!current()) return null;
      if (data.anio_escolar_id !== year.id || data.fecha !== date || data.pagination.page !== page
        || data.pagination.limit !== 100 || typeof data.pagination.has_more !== 'boolean'
        || !Array.isArray(data.secciones) || data.secciones.length > 100 || (data.pagination.has_more && !data.secciones.length)) {
        throw new Error('Listado de secciones incompleto.');
      }
      rows.push(...data.secciones);
      if (!data.pagination.has_more) break;
      if (page === 100) throw new Error('El listado supera el límite de consulta.');
    }
    // Reutiliza las comprobaciones de conteos, sesiones y secciones del resumen existente.
    summarizeDay(rows, year.id);
    for (const row of rows) {
      if (ids.has(row.seccion.id)) throw new Error('Sección duplicada.');
      ids.add(row.seccion.id); result.push(row);
    }
  }
  return result;
}

// Abrir o cerrar una sesión no completa la asistencia si todavía faltan marcas efectivas.
export function registrarDayStatus(row: SupervisionSection): 'Sin registro' | 'Con pendientes' | 'Registrada' {
  const counts = row.resumen;
  if (!counts || counts.presentes + counts.tardanzas + counts.faltas === 0) return 'Sin registro';
  return counts.pendientes > 0 ? 'Con pendientes' : 'Registrada';
}
