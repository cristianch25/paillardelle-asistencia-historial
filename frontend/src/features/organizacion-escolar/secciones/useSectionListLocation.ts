import { useSearchParams } from 'react-router';
import type { EducationLevel, SectionFilters } from './secciones.types';
import { gradesForLevel } from './sectionPresentation';

export function sectionFiltersForLevel(filters: SectionFilters, nivel: EducationLevel | ''): SectionFilters {
  const changesMeaning = filters.nivel !== '' && nivel !== ''
    && (filters.nivel === 'INICIAL') !== (nivel === 'INICIAL');
  const validGrade = gradesForLevel(nivel).map(String).includes(filters.grado);
  return { ...filters, nivel, grado: !changesMeaning && validGrade ? filters.grado : '' };
}

export function normalizeSectionFilters(filters: SectionFilters, levels: readonly EducationLevel[]) {
  const unauthorized = filters.nivel !== '' && !levels.includes(filters.nivel);
  const nivel = levels.length === 1 ? levels[0]! : unauthorized ? '' : filters.nivel;
  const next = sectionFiltersForLevel(filters, nivel);
  return { filters: next, resetPage: unauthorized || next.grado !== filters.grado };
}

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
