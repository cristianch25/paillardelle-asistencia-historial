import { useId } from 'react';
import FormField from '../../../shared/components/FormField';
import type { SchoolYear } from '../../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { educationLevelLabels } from '../../organizacion-escolar/secciones/sectionPresentation';
import type { SupervisionFilters } from '../supervision/supervision.types';
import { supervisionDateError } from '../supervision/supervisionDate';
import type { EducationLevel } from '../../organizacion-escolar/secciones/secciones.types';

export default function AdminAttendanceFilters({ years, value, onChange, globalSearch = false, levels }: {
  years: SchoolYear[]; value: SupervisionFilters; onChange: (filters: SupervisionFilters) => void; globalSearch?: boolean;
  levels: readonly EducationLevel[];
}) {
  const id = useId(), year = years.find(row => row.id === value.anio_escolar_id);
  const control = 'mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
  function change(patch: Partial<SupervisionFilters>) { onChange({ ...value, ...patch, seccion_id: '', page: 1 }); }
  return <section aria-label="Filtros de asistencias" className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
    <label htmlFor={`${id}-year`} className="min-w-0 text-sm font-semibold">Año escolar
      <select id={`${id}-year`} className={control} value={value.anio_escolar_id} onChange={e => change({ anio_escolar_id: e.target.value })}>
        <option value="">Selecciona un año</option>{years.map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}
      </select>
    </label>
    <FormField label="Fecha" type="date" value={value.fecha} min={globalSearch ? undefined : year?.fecha_inicio} max={globalSearch ? undefined : year?.fecha_fin}
      error={supervisionDateError(value.fecha, globalSearch ? undefined : year) || undefined} onChange={e => change({ fecha: e.target.value })} />
    <label htmlFor={`${id}-level`} className="min-w-0 text-sm font-semibold">Nivel educativo
      <select id={`${id}-level`} className={control} value={value.nivel} onChange={e => change({ nivel: e.target.value as SupervisionFilters['nivel'] })}>
        <option value="">Todos los autorizados</option>{levels.map(level => <option key={level} value={level}>{educationLevelLabels[level]}</option>)}
      </select>
    </label>
  </section>;
}
