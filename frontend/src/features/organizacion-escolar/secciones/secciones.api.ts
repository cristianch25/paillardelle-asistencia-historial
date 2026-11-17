import { httpClient } from '../../../shared/api/httpClient';
import type { Section, SectionsQuery, SectionsResponse } from './secciones.types';

export async function getSections(query: SectionsQuery): Promise<SectionsResponse> {
  const { data } = await httpClient.get<SectionsResponse>('/secciones/', { params: query });
  return data;
}

// Revalidación con el listado autorizado; no se añade un filtro por ID inexistente.
export async function findAccessibleSection(id: string, yearId: string): Promise<Section | undefined> {
  let page = 1;
  while (true) {
    const data = await getSections({ anio_escolar_id: yearId, page, limit: 100 });
    if (data.pagination.page !== page) throw new Error('Paginación de secciones inconsistente.');
    const section = data.secciones.find(row => row.id === id && row.anio_escolar_id === yearId);
    if (section || !data.pagination.has_more) return section;
    page++;
  }
}
