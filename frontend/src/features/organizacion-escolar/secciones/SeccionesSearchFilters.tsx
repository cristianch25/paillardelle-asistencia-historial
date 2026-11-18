import { useId } from 'react';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';

type Props = { years: SchoolYear[]; yearId: string; query: string; disabled?: boolean;
  onYearChange: (id: string) => void; onQueryChange: (query: string) => void };
const control = 'mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal focus-visible:outline-2 focus-visible:outline-institutional-700 disabled:bg-slate-100';

export default function SeccionesSearchFilters({ years, yearId, query, disabled, onYearChange, onQueryChange }: Props) {
  const id = useId();
  return <section aria-label="Búsqueda de secciones" className="grid min-w-0 gap-5 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-6">
    <label htmlFor={`${id}-year`} className="min-w-0 text-sm font-semibold">Año escolar
      <select id={`${id}-year`} className={control} value={yearId} disabled={disabled} onChange={event => onYearChange(event.target.value)}>
        <option value="">Selecciona un año</option>
        {years.map(year => <option key={year.id} value={year.id}>{year.anio} · {year.estado}</option>)}
      </select>
    </label>
    <label htmlFor={`${id}-search`} className="min-w-0 text-sm font-semibold">Buscar por nivel, grado o sección
      <input id={`${id}-search`} className={control} type="search" value={query} disabled={!yearId}
        placeholder="Primaria 1 A o Creativos" onChange={event => onQueryChange(event.target.value)} />
    </label>
  </section>;
}
