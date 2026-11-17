import type { Section } from '../organizacion-escolar/secciones/secciones.types';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { validCivilDate } from '../../shared/dates/civilDate';
import { getAttendanceSupervision } from './supervision/supervision.api';
import type { SupervisionSection } from './supervision/supervision.types';

export type SectionAttendanceStatus = { status: 'loading' | 'error' | 'outside-year' }
  | { status: 'ready'; item: SupervisionSection };
export type SectionAttendanceSummaries = Record<string, SectionAttendanceStatus>;

async function loadYear(yearId: string, date: string, ids: Set<string>, isCurrent: () => boolean) {
  const found = new Map<string, SupervisionSection>(), seen = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    if (!isCurrent()) return null;
    const data = await getAttendanceSupervision({ anio_escolar_id: yearId, fecha: date, page, limit: 100 });
    if (!isCurrent()) return null;
    if (data.anio_escolar_id !== yearId || data.fecha !== date || data.pagination.page !== page
      || data.pagination.limit !== 100 || typeof data.pagination.has_more !== 'boolean'
      || !Array.isArray(data.secciones) || data.secciones.length > 100
      || (data.pagination.has_more && !data.secciones.length)) throw new Error('Resumen paginado incompatible.');
    for (const item of data.secciones) {
      if (item.seccion.anio_escolar_id !== yearId || seen.has(item.seccion.id)
        || typeof item.es_lectivo !== 'boolean' || !['ABIERTA', 'CERRADA', 'SIN_REGISTRO'].includes(item.situacion)) {
        throw new Error('Sección de resumen incompatible.');
      }
      seen.add(item.seccion.id);
      if (item.situacion === 'SIN_REGISTRO' ? item.resumen !== null || item.sesion_id !== null
        : !item.sesion_id || !item.resumen || ['total', 'presentes', 'tardanzas', 'faltas', 'pendientes'].some(key => {
          const value = item.resumen![key as keyof NonNullable<SupervisionSection['resumen']>];
          return !Number.isSafeInteger(value) || value < 0;
        })) throw new Error('Datos de resumen incompatibles.');
      if (ids.has(item.seccion.id)) found.set(item.seccion.id, item);
    }
    if (found.size === ids.size || !data.pagination.has_more) return found;
  }
  throw new Error('Se excedió el límite de páginas de resúmenes.');
}

export async function getSectionAttendanceSummaries(sections: Section[], years: SchoolYear[], date: string,
  isCurrent: () => boolean): Promise<SectionAttendanceSummaries | null> {
  const result: SectionAttendanceSummaries = {}, groups = new Map<string, Set<string>>();
  for (const section of sections) {
    const year = years.find(item => item.id === section.anio_escolar_id);
    if (!year || !validCivilDate(date) || !validCivilDate(year.fecha_inicio) || !validCivilDate(year.fecha_fin)
      || year.fecha_inicio > year.fecha_fin) {
      result[section.id] = { status: 'error' };
    } else if (date < year.fecha_inicio || date > year.fecha_fin) {
      result[section.id] = { status: 'outside-year' };
    } else {
      if (!groups.has(year.id)) groups.set(year.id, new Set());
      groups.get(year.id)!.add(section.id);
    }
  }
  for (const [yearId, ids] of groups) {
    if (!isCurrent()) return null;
    try {
      const found = await loadYear(yearId, date, ids, isCurrent);
      if (!found) return null;
      for (const id of ids) result[id] = found.has(id) ? { status: 'ready', item: found.get(id)! } : { status: 'error' };
    } catch {
      if (!isCurrent()) return null;
      for (const id of ids) result[id] = { status: 'error' };
    }
  }
  return isCurrent() ? result : null;
}
