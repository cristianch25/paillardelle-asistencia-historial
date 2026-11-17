import { httpClient } from '../../../shared/api/httpClient';
import type { SupervisionQuery, SupervisionResponse } from './supervision.types';
import type { Section } from '../../organizacion-escolar/secciones/secciones.types';

export async function getAttendanceSupervision(params: SupervisionQuery): Promise<SupervisionResponse> {
  const { data } = await httpClient.get<SupervisionResponse>('/asistencias/sesiones', { params });
  return data;
}

export type SupervisionScope = Pick<SupervisionQuery, 'anio_escolar_id' | 'fecha' | 'nivel'>;

// Publicar solo el conjunto completo. La vigencia evita continuar un recorrido obsoleto.
export async function getSupervisionSections(scope: SupervisionScope, isCurrent: () => boolean): Promise<Section[] | null> {
  const sections = new Map<string, Section>();
  for (let page = 1; page <= 100; page++) {
    if (!isCurrent()) return null;
    const data = await getAttendanceSupervision({ ...scope, page, limit: 100 });
    if (!isCurrent()) return null;
    if (data.anio_escolar_id !== scope.anio_escolar_id || data.fecha !== scope.fecha
      || data.pagination.page !== page || data.pagination.limit !== 100
      || typeof data.pagination.has_more !== 'boolean' || data.secciones.length > 100
      || (data.pagination.has_more && data.secciones.length === 0)) throw new Error('Paginación de opciones inconsistente.');
    for (const { seccion } of data.secciones) {
      if (sections.has(seccion.id)) throw new Error('Sección repetida durante la carga de opciones.');
      sections.set(seccion.id, seccion);
    }
    if (!data.pagination.has_more) return [...sections.values()];
  }
  throw new Error('Se excedió el límite de páginas de opciones.');
}
