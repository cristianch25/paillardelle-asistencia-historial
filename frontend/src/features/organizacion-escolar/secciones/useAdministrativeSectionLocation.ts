import { useSearchParams } from 'react-router';

export function useAdministrativeSectionLocation() {
  const [params, setParams] = useSearchParams();
  const yearId = params.get('anio_escolar_id') ?? '', query = params.get('q') ?? '';
  const candidate = params.get('page') ?? '1';
  const page = /^[1-9]\d*$/.test(candidate) && Number.isSafeInteger(Number(candidate)) ? Number(candidate) : 1;
  function update(year: string, search: string, nextPage: number) {
    setParams({ anio_escolar_id: year, q: search, page: String(nextPage) }, { replace: true });
  }
  return { yearId, query, page, changeYear: (id: string) => update(id, '', 1),
    changeQuery: (value: string) => update(yearId, value, 1), setPage: (value: number) => update(yearId, query, value) };
}
