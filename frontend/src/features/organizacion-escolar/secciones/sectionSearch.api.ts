import { getSections } from './secciones.api';
import type { Section } from './secciones.types';

export async function getSectionSearchCatalog(yearId: string, isCurrent: () => boolean): Promise<Section[] | null> {
  const sections = new Map<string, Section>();
  for (let page = 1; page <= 100; page++) {
    if (!isCurrent()) return null;
    const data = await getSections({ anio_escolar_id: yearId, page, limit: 100 });
    if (!isCurrent()) return null;
    if (data.pagination.page !== page || data.pagination.limit !== 100
      || typeof data.pagination.has_more !== 'boolean' || data.secciones.length > 100
      || (data.pagination.has_more && data.secciones.length === 0)) throw new Error('Paginación de secciones inconsistente.');
    for (const section of data.secciones) {
      if (section.anio_escolar_id !== yearId || sections.has(section.id)) throw new Error('Catálogo de secciones inconsistente.');
      sections.set(section.id, section);
    }
    if (!data.pagination.has_more) return [...sections.values()];
  }
  throw new Error('El catálogo supera el límite de carga de secciones.');
}
