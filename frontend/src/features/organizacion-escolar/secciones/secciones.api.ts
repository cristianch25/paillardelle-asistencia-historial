import { httpClient } from '../../../shared/api/httpClient';
import axios from 'axios';
import type { EducationLevel } from './secciones.types';
import type { Section, SectionInput, SectionBatchInput, SectionPatch, SectionsQuery, SectionsResponse } from './secciones.types';

export async function getSectionManagementLevels(): Promise<EducationLevel[]> {
  const levels: EducationLevel[] = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];
  const allowed = await Promise.all(levels.map(async nivel => {
    try {
      // El GET comprueba el ámbito antes de listar, incluso cuando no hay secciones.
      const data = await getSections({ nivel, page: 1, limit: 1 });
      if (!Array.isArray(data.secciones) || data.pagination?.page !== 1 || data.pagination.limit !== 1
        || typeof data.pagination.has_more !== 'boolean') throw new Error('Ámbito de secciones no confirmado.');
      return nivel;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) return null;
      throw error;
    }
  }));
  return allowed.filter((level): level is EducationLevel => level !== null);
}

export async function createSection(input: SectionInput): Promise<Section> {
  const { data, status } = await httpClient.post<{ seccion: Section }>('/secciones', input);
  if (status !== 201 || typeof data?.seccion?.id !== 'string' || data.seccion.activo !== true
    || Object.entries(input).some(([key, value]) => data.seccion[key as keyof Section] !== value)) throw new Error('Confirmación de sección no válida.');
  return data.seccion;
}

export async function updateSection(id: string, input: SectionPatch): Promise<Section> {
  const { data, status } = await httpClient.patch<{ seccion: Section }>(`/secciones/${id}`, input);
  if (status !== 200 || data?.seccion?.id !== id
    || Object.entries(input.cambios).some(([key, value]) => data.seccion[key as keyof Section] !== value)) throw new Error('Confirmación de sección no válida.');
  return data.seccion;
}

export async function createSectionBatch(input: SectionBatchInput): Promise<Section[]> {
  const { data, status } = await httpClient.post<{ secciones: Section[] }>('/secciones/lote', input);
  const count = input.letra_hasta.charCodeAt(0) - input.letra_desde.charCodeAt(0) + 1;
  const rows = data?.secciones;
  if (status !== 201 || !Array.isArray(rows) || rows.length !== count || new Set(rows.map(row => row?.id)).size !== count
    || rows.some((row, index) => !row || typeof row.id !== 'string' || !/^[1-9]\d*$/.test(row.id)
      || row.anio_escolar_id !== input.anio_escolar_id || row.nivel !== input.nivel || row.grado !== input.grado
      || row.letra !== String.fromCharCode(input.letra_desde.charCodeAt(0) + index) || row.activo !== true || row.turno !== null)) {
    throw new Error('Confirmación del lote de secciones no válida.');
  }
  return rows;
}

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
