import { httpClient } from '../../shared/api/httpClient';
import { getAllSchoolYears } from '../organizacion-escolar/anios-escolares/aniosEscolares.api';
import type { Pagination } from '../../shared/types/pagination';
import type { SectionAssignment } from '../organizacion-escolar/secciones/sectionStaff.api';
import type { Section } from '../organizacion-escolar/secciones/secciones.types';
import type { AssignmentRegistrar, AssignmentCatalog, AssignmentBatchInput } from './usuarios.types';

async function collect<T extends { id: string }>(path: string, key: string): Promise<T[]> {
  const rows: T[] = [], seen = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    const { data } = await httpClient.get<Record<string, unknown>>(path, { params: { page, limit: 100 } });
    const pagination = data.pagination as Pagination, values = data[key] as T[];
    if (!pagination || pagination.page !== page || pagination.limit !== 100 || typeof pagination.has_more !== 'boolean'
      || !Array.isArray(values) || values.length > 100 || (pagination.has_more && !values.length)) throw new Error('Catálogo de asignaciones incompleto.');
    for (const value of values) {
      if (typeof value.id !== 'string' || seen.has(value.id)) throw new Error('Catálogo de asignaciones inconsistente.');
      seen.add(value.id); rows.push(value);
    }
    if (!pagination.has_more) return rows;
  }
  throw new Error('El catálogo supera el límite de consulta.');
}
export async function getAssignmentCatalog(): Promise<AssignmentCatalog> {
  const [registrars, sections, assignments, years] = await Promise.all([
    collect<AssignmentRegistrar>('/asignaciones/registradores', 'registradores'),
    collect<Section>('/asignaciones/secciones', 'secciones'),
    collect<SectionAssignment>('/asignaciones', 'asignaciones'), getAllSchoolYears(),
  ]);
  return { registrars, sections, assignments, years };
}
export async function assignSections(input: AssignmentBatchInput) {
  const { data, status } = await httpClient.post<{ asignaciones: SectionAssignment[] }>('/asignaciones', input);
  const rows = data?.asignaciones;
  if (status !== 201 || !Array.isArray(rows) || rows.length !== input.seccion_ids.length
    || new Set(rows.map(row => row.id)).size !== rows.length
    || new Set(rows.map(row => row.seccion_id)).size !== rows.length
    || rows.some(row => typeof row.id !== 'string' || row.usuario_id !== input.usuario_id || !input.seccion_ids.includes(row.seccion_id)
      || row.fecha_inicio !== input.fecha_inicio || row.fecha_fin !== input.fecha_fin)) throw new Error('No se pudo confirmar el lote completo.');
}
