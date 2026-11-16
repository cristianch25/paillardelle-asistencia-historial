import { httpClient } from '../../../shared/api/httpClient';
import { validCivilDate } from '../../../shared/dates/civilDate';
import type { Pagination } from '../../../shared/types/pagination';

export type SectionAssignment = {
  id: string;
  usuario_id: string;
  seccion_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  usuario: { nombres: string; apellidos: string; cargo: string | null };
};
type Response = { asignaciones: SectionAssignment[]; pagination: Pagination };

export async function getSectionStaff(sectionId: string, yearId: string, date: string,
  isCurrent: () => boolean): Promise<SectionAssignment[] | null> {
  const assignments = new Map<string, SectionAssignment>();
  for (let page = 1; page <= 100; page++) {
    if (!isCurrent()) return null;
    const { data } = await httpClient.get<Response>('/asignaciones', {
      params: { seccion_id: sectionId, anio_escolar_id: yearId, page, limit: 100 },
    });
    if (!isCurrent()) return null;
    if (data.pagination.page !== page || data.pagination.limit !== 100
      || typeof data.pagination.has_more !== 'boolean' || !Array.isArray(data.asignaciones)
      || data.asignaciones.length > 100 || (data.pagination.has_more && !data.asignaciones.length)) {
      throw new Error('Paginación de asignaciones inconsistente.');
    }
    for (const assignment of data.asignaciones) {
      if (assignment.seccion_id !== sectionId || typeof assignment.id !== 'string' || assignments.has(assignment.id)
        || !validCivilDate(assignment.fecha_inicio) || (assignment.fecha_fin !== null
          && (!validCivilDate(assignment.fecha_fin) || assignment.fecha_fin < assignment.fecha_inicio))
        || typeof assignment.usuario?.nombres !== 'string' || typeof assignment.usuario.apellidos !== 'string'
        || (assignment.usuario.cargo !== null && typeof assignment.usuario.cargo !== 'string')) {
        throw new Error('Asignaciones inconsistentes.');
      }
      assignments.set(assignment.id, assignment);
    }
    if (!data.pagination.has_more) return [...assignments.values()].filter(assignment =>
      assignment.fecha_inicio <= date && (assignment.fecha_fin === null || assignment.fecha_fin >= date));
  }
  throw new Error('Las asignaciones superan el límite de carga.');
}
