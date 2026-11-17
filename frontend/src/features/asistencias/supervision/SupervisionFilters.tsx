import { useId } from 'react';
import type { SchoolYear } from '../../organizacion-escolar/anios-escolares/aniosEscolares.types';
import type { EducationLevel } from '../../organizacion-escolar/secciones/secciones.types';
import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import type { SupervisionFilters as Filters } from './supervision.types';
import type { useSupervisionSections } from './useSupervisionSections';
import Button from '../../../shared/components/Button';

type Props = { years: SchoolYear[]; levels: readonly EducationLevel[]; options: ReturnType<typeof useSupervisionSections>; sectionRequired?: boolean;
  value: Filters; onChange: (value: Filters) => void };
const control = 'mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal focus-visible:outline-2 focus-visible:outline-institutional-700 disabled:bg-slate-100';

function changeSupervisionFilter<K extends keyof Omit<Filters, 'page'>>(filters: Filters, key: K, value: Filters[K]): Filters {
  return { ...filters, [key]: value, page: 1, ...(key !== 'seccion_id' ? { seccion_id: '' } : {}) };
}

export default function SupervisionFilters({ years, levels, options, value, onChange, sectionRequired = false }: Props) {
  const id = useId();
  const update = <K extends keyof Omit<Filters, 'page'>>(key: K, next: Filters[K]) => onChange(changeSupervisionFilter(value, key, next));
  return <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-4">
    <label className="min-w-0 text-sm font-semibold" htmlFor={`${id}-year`}>Año escolar
      <select id={`${id}-year`} className={control} value={value.anio_escolar_id} onChange={e => update('anio_escolar_id', e.target.value)}>
        <option value="">Selecciona un año</option>
        {years.map(year => <option key={year.id} value={year.id}>{year.anio} · {year.estado}</option>)}
      </select>
    </label>
    <label className="min-w-0 text-sm font-semibold" htmlFor={`${id}-date`}>Fecha
      <input id={`${id}-date`} type="date" className={control} value={value.fecha} onChange={e => update('fecha', e.target.value)} />
    </label>
    <label className="min-w-0 text-sm font-semibold" htmlFor={`${id}-level`}>Nivel educativo
      <select id={`${id}-level`} className={control} value={value.nivel} disabled={!value.anio_escolar_id}
        onChange={e => update('nivel', e.target.value as Filters['nivel'])}>
        <option value="">Todos los niveles autorizados</option>
        {levels.map(level => <option key={level} value={level}>{educationLevelLabels[level]}</option>)}
      </select>
    </label>
    <div className="min-w-0 text-sm font-semibold">
      <label htmlFor={`${id}-section`}>Sección</label>
      <select id={`${id}-section`} className={control} value={value.seccion_id}
        disabled={!options.ready || options.loading || Boolean(options.error) || options.sections.length === 0}
        aria-busy={options.loading}
        aria-describedby={`${id}-section-hint`} onChange={e => update('seccion_id', e.target.value)}>
        <option value="">{sectionRequired ? 'Selecciona una sección' : 'Todas las secciones autorizadas'}</option>
        {value.seccion_id && !options.sections.some(section => section.id === value.seccion_id)
          && <option value={value.seccion_id} disabled>Sección seleccionada sin revalidar</option>}
        {options.sections.map(section => <option key={section.id} value={section.id}>{educationLevelLabels[section.nivel]} · {formatSectionName(section)}</option>)}
      </select>
      <p id={`${id}-section-hint`} role={options.error ? 'alert' : 'status'} className="mt-2 text-xs font-normal text-slate-600">
        {options.loading ? 'Cargando secciones…' : options.error || (!options.ready ? 'Selecciona un año y una fecha.'
          : options.sections.length === 0 ? 'No hay secciones autorizadas para esta consulta.'
            : sectionRequired ? 'Selecciona una sección para consultar sus estudiantes.' : 'Selecciona una sección o consulta todas.')}
      </p>
      {options.error && <Button variant="secondary" onClick={options.retry}>Reintentar secciones</Button>}
    </div>
  </div>;
}
