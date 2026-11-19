import { httpClient } from '../../../shared/api/httpClient';
import type { SchoolYear, SchoolYearInput, SchoolYearsResponse } from './aniosEscolares.types';

export async function createSchoolYear(input: SchoolYearInput): Promise<SchoolYear> {
  const { data } = await httpClient.post<{ anio_escolar: SchoolYear }>('/anios-escolares', input);
  return data.anio_escolar;
}

export async function changeSchoolYear(id: string, action: 'abrir' | 'cerrar'): Promise<SchoolYear> {
  const { data } = await httpClient.patch<{ anio_escolar: SchoolYear }>(`/anios-escolares/${id}/${action}`, {});
  return data.anio_escolar;
}

export async function getAllSchoolYears(): Promise<SchoolYear[]> {
  const years: SchoolYear[] = [];
  let page = 1;
  while (true) {
    const { data } = await httpClient.get<SchoolYearsResponse>('/anios-escolares', { params: { page, limit: 100 } });
    if (data.pagination.page !== page) throw new Error('Paginación de años inconsistente.');
    years.push(...data.anios_escolares);
    if (!data.pagination.has_more) return years;
    page++;
  }
}
