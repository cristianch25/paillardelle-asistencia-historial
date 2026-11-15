import { useSearchParams } from 'react-router';
import type { SectionFilters } from './secciones.types';

export function readSectionListLocation(params: URLSearchParams, defaultYear = '') {
  const nivel = params.get('nivel') ?? '';
  const activo = params.get('activo') ?? '';
  const rawPage = params.get('page') ?? '1';
  const page = /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) ? Number(rawPage) : 1;
  const filters: SectionFilters = {
    nivel: nivel === 'INICIAL' || nivel === 'PRIMARIA' || nivel === 'SECUNDARIA' ? nivel : '',
    grado: params.get('grado') ?? '',
    activo: activo === 'true' || activo === 'false' ? activo : '',
  };
  return { yearId: params.get('anio_escolar_id') ?? defaultYear, filters, page };
}

export function useSectionListLocation(defaultYear = '') {
  const [params, setParams] = useSearchParams();
  const state = readSectionListLocation(params, defaultYear);
  function update(next: typeof state) {
    const query = new URLSearchParams({ anio_escolar_id: next.yearId, page: String(next.page) });
    for (const [key, value] of Object.entries(next.filters)) if (value) query.set(key, value);
    setParams(query, { replace: true });
  }
  return { ...state, update, setPage: (page: number) => update({ ...state, page }) };
}
