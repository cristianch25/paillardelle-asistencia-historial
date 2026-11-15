import { useId } from 'react';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';
import type { EducationLevel, SectionFilters } from './secciones.types';

type Props = {
  years: SchoolYear[];
  yearId: string;
  filters: SectionFilters;
  onYearChange: (id: string) => void;
  onFiltersChange: (filters: SectionFilters) => void;
};
const selectStyle = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 disabled:bg-slate-100';

export default function SeccionesFilters({ years, yearId, filters, onYearChange, onFiltersChange }: Props) {
  const id = useId();
  const grades = filters.nivel === 'INICIAL' ? [4, 5] : filters.nivel === 'SECUNDARIA' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
  const gradeLabel = filters.nivel === 'INICIAL' ? 'Edad' : filters.nivel ? 'Grado' : 'Grado / edad';
  function gradeOption(grade: number) {
    if (filters.nivel === 'INICIAL') return `${grade} años`;
    if (!filters.nivel && [4, 5].includes(grade)) return `${grade}.º / ${grade} años`;
    return `${grade}.º`;
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <label htmlFor={`${id}-year`} className="text-sm font-semibold">Año escolar
        <select id={`${id}-year`} value={yearId} onChange={event => onYearChange(event.target.value)} className={selectStyle}>
          <option value="">Selecciona un año</option>
          {years.map(year => <option key={year.id} value={year.id}>{year.anio} · {year.estado}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-level`} className="text-sm font-semibold">Nivel educativo
        <select id={`${id}-level`} disabled={!yearId} value={filters.nivel} className={selectStyle}
          onChange={event => onFiltersChange({ ...filters, nivel: event.target.value as EducationLevel | '', grado: '' })}>
          <option value="">Todos los niveles</option>
          <option value="INICIAL">Inicial</option><option value="PRIMARIA">Primaria</option><option value="SECUNDARIA">Secundaria</option>
        </select>
      </label>
      <label htmlFor={`${id}-grade`} className="text-sm font-semibold">{gradeLabel}
        <select id={`${id}-grade`} disabled={!yearId} value={filters.grado} className={selectStyle}
          onChange={event => onFiltersChange({ ...filters, grado: event.target.value })}>
          <option value="">{filters.nivel === 'INICIAL' ? 'Todas las edades' : 'Todos'}</option>
          {grades.map(grade => <option key={grade} value={String(grade)}>{gradeOption(grade)}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-active`} className="text-sm font-semibold">Estado de sección
        <select id={`${id}-active`} disabled={!yearId} value={filters.activo} className={selectStyle}
          onChange={event => onFiltersChange({ ...filters, activo: event.target.value as SectionFilters['activo'] })}>
          <option value="">Todas</option><option value="true">Activa</option><option value="false">Inactiva</option>
        </select>
      </label>
    </div>
  );
}
