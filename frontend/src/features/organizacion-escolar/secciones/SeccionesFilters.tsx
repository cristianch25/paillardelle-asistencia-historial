import { useId } from 'react';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';
import type { EducationLevel, SectionFilters } from './secciones.types';
import { educationLevels } from './sectionLevels.api';
import { educationLevelLabels, gradesForLevel } from './sectionPresentation';
import { sectionFiltersForLevel } from './useSectionListLocation';

type Props = {
  years: SchoolYear[];
  yearId: string;
  filters: SectionFilters;
  onYearChange: (id: string) => void;
  onFiltersChange: (filters: SectionFilters) => void;
  levels?: readonly EducationLevel[];
  allLevelsLabel?: string;
};
const selectStyle = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 disabled:bg-slate-100';

export default function SeccionesFilters({ years, yearId, filters, onYearChange, onFiltersChange,
  levels = educationLevels, allLevelsLabel = 'Todos los niveles' }: Props) {
  const id = useId();
  const onlyLevel = levels.length === 1 ? levels[0] : undefined;
  const level = filters.nivel && levels.includes(filters.nivel) ? filters.nivel : onlyLevel ?? '';
  const grades = gradesForLevel(level);
  const gradeLabel = level === 'INICIAL' ? 'Edad' : level ? 'Grado' : 'Grado / edad';
  function gradeOption(grade: number) {
    if (level === 'INICIAL') return `${grade} años`;
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
      {onlyLevel ? <div className="text-sm font-semibold"><p>Nivel educativo</p>
        <p className="mt-2 flex min-h-11 items-center text-base font-normal">{educationLevelLabels[onlyLevel]}</p>
      </div> : <label htmlFor={`${id}-level`} className="text-sm font-semibold">Nivel educativo
        <select id={`${id}-level`} disabled={!yearId} value={filters.nivel} className={selectStyle}
          onChange={event => onFiltersChange(sectionFiltersForLevel(filters, event.target.value as EducationLevel | ''))}>
          <option value="">{allLevelsLabel}</option>
          {levels.map(level => <option key={level} value={level}>{educationLevelLabels[level]}</option>)}
        </select>
      </label>}
      <label htmlFor={`${id}-grade`} className="text-sm font-semibold">{gradeLabel}
        <select id={`${id}-grade`} disabled={!yearId || !level} value={level ? filters.grado : ''} className={selectStyle}
          aria-describedby={!level ? `${id}-grade-hint` : undefined}
          onChange={event => onFiltersChange({ ...filters, grado: event.target.value })}>
          <option value="">{level === 'INICIAL' ? 'Todas las edades' : 'Todos'}</option>
          {grades.map(grade => <option key={grade} value={String(grade)}>{gradeOption(grade)}</option>)}
        </select>
        {!level && <span id={`${id}-grade-hint`} className="mt-2 block text-xs font-normal text-slate-600">Selecciona un nivel para filtrar por grado o edad.</span>}
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
