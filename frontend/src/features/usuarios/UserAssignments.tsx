import { useId, useState, type SubmitEvent } from 'react';
import FormField from '../../shared/components/FormField';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import { validCivilDate } from '../../shared/dates/civilDate';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { educationLevelLabels, formatAdministrativeSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import type { AssignmentBatchInput, AssignmentRegistrar, AssignmentCatalog } from './usuarios.types';
import { useInitialSchoolYear } from '../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import type { SectionAssignment } from '../organizacion-escolar/secciones/sectionStaff.api';
import AssignmentHistory from './AssignmentHistory';

type Props = { user: AssignmentRegistrar; catalog: Pick<AssignmentCatalog, 'sections' | 'years' | 'assignments'>; busy: boolean; onSave: (input: AssignmentBatchInput) => Promise<boolean>; onClose: () => void;
  onFinalize: (assignment: SectionAssignment, date: string) => Promise<boolean> };
const control = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
export default function UserAssignments({ user, catalog, busy, onSave, onClose, onFinalize }: Props) {
  const id = useId(), [yearId, setYear] = useState(''), [selected, setSections] = useState<string[]>([]);
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [error, setError] = useState('');
  const canAssign = user.rol === 'REGISTRADOR' && user.activo;
  const eligibleYears = catalog.years.filter(row => ['PLANIFICADO', 'ABIERTO'].includes(row.estado));
  useInitialSchoolYear(eligibleYears, canAssign, yearId, setYear);
  const year = eligibleYears.find(row => row.id === yearId);
  const sections = catalog.sections.filter(row => row.anio_escolar_id === yearId && row.activo
    && (user.nivel_asignado === null || row.nivel === user.nivel_asignado));
  const assignments = catalog.assignments.filter(row => row.usuario_id === user.id);
  useUnsavedChanges(`user-assignment:${user.id}`, Boolean(selected.length || start || end), busy);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAssign || !year || !['PLANIFICADO', 'ABIERTO'].includes(year.estado) || !selected.length || selected.length > 100
      || selected.some(value => !sections.some(row => row.id === value))
      || !validCivilDate(start) || (end && !validCivilDate(end)) || start < year.fecha_inicio || start > year.fecha_fin
      || (end && (end < start || end > year.fecha_fin))) { setError('Selecciona una sección y fechas válidas dentro del año escolar.'); return; }
    const conflicts = assignments.filter(row => selected.includes(row.seccion_id) && row.fecha_inicio <= (end || '9999-12-31')
      && (row.fecha_fin === null || row.fecha_fin >= start));
    if (conflicts.length) {
      const names = [...new Set(conflicts.map(row => sections.find(section => section.id === row.seccion_id)!))]
        .map(row => `${educationLevelLabels[row.nivel]} ${formatAdministrativeSectionName(row)}`).join(', ');
      setError(`Ya existen asignaciones en estas fechas: ${names}. No se guardó ninguna sección.`); return;
    }
    setError('');
    if (await onSave({ usuario_id: user.id, anio_escolar_id: year.id, seccion_ids: selected, fecha_inicio: start, fecha_fin: end || null })) {
      setSections([]); setStart(''); setEnd('');
    }
  }
  return <section aria-label="Asignaciones del usuario" className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="break-words text-xl font-semibold">Asignaciones de {user.nombres} {user.apellidos}</h2>
    {canAssign ? <form aria-label="Nueva asignación" onSubmit={e => void submit(e)} className="space-y-4">
      <h3 className="font-semibold">Nueva asignación</h3>
      {error && <ErrorState message={error} />}
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold" htmlFor={`${id}-year`}>Año escolar
          <select id={`${id}-year`} className={control} required value={yearId} onChange={e => { setYear(e.target.value); setSections([]); setError(''); }}>
            <option value="">Selecciona un año</option>{eligibleYears
              .map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}
          </select>
        </label>
        <FormField label="Fecha de inicio" type="date" required min={year?.fecha_inicio} max={year?.fecha_fin} value={start} onChange={e => setStart(e.target.value)} />
        <FormField label="Fecha de fin" type="date" min={start || year?.fecha_inicio} max={year?.fecha_fin} value={end}
          hint="Opcional. Ambas fechas son inclusivas." onChange={e => setEnd(e.target.value)} />
        <fieldset disabled={!yearId} className="min-w-0 space-y-2 sm:col-span-2">
          <legend className="font-semibold">Secciones</legend>
          <p role="status" className="text-sm text-slate-600">{selected.length} secciones seleccionadas</p>
          {!sections.length && <p className="text-sm text-slate-600">No hay secciones disponibles para este año y registrador.</p>}
          <div className="grid gap-2 sm:grid-cols-2">{sections.map(section => <label key={section.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <input type="checkbox" className="size-5 shrink-0" checked={selected.includes(section.id)} onChange={event => {
              setSections(current => event.target.checked ? [...current, section.id] : current.filter(value => value !== section.id)); setError('');
            }} />{educationLevelLabels[section.nivel]}: {formatAdministrativeSectionName(section)}
          </label>)}</div>
        </fieldset>
      </fieldset>
      <Button type="submit" disabled={busy || !selected.length}>{busy ? 'Guardando…' : 'Asignar secciones'}</Button>
    </form> : <p className="text-sm text-slate-600">Solo los REGISTRADOR activos pueden recibir nuevas asignaciones.</p>}
    <Button variant="secondary" disabled={busy} onClick={onClose}>Volver al listado</Button>
    <AssignmentHistory assignments={assignments} catalog={catalog} busy={busy} onFinalize={onFinalize} />
  </section>;
}
