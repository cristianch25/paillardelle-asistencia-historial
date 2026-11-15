import { httpClient } from '../../../shared/api/httpClient';
import type { SchoolYear, SchoolYearsResponse } from './aniosEscolares.types';

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
