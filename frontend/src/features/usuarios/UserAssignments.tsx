import { useId, useState, type SubmitEvent } from 'react';
import FormField from '../../shared/components/FormField';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import { formatCivilDate, peruToday, validCivilDate } from '../../shared/dates/civilDate';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { educationLevelLabels, formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import { assignmentSectionLabel, type AssignmentInput, type ManagedUser, type UsersCatalog } from './usuarios.types';
import { useInitialSchoolYear } from '../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import type { SectionAssignment } from '../organizacion-escolar/secciones/sectionStaff.api';
import AssignmentEndDialog from './AssignmentEndDialog';

type Props = { user: ManagedUser; catalog: UsersCatalog; busy: boolean; onSave: (input: AssignmentInput) => Promise<boolean>; onClose: () => void;
  onFinalize: (assignment: SectionAssignment, date: string) => Promise<boolean> };
const control = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
export default function UserAssignments({ user, catalog, busy, onSave, onClose, onFinalize }: Props) {
  const id = useId(), [yearId, setYear] = useState(''), [sectionId, setSection] = useState('');
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [error, setError] = useState('');
  const [ending, setEnding] = useState<SectionAssignment | null>(null);
  const canAssign = user.rol === 'REGISTRADOR' && user.activo;
  const eligibleYears = catalog.years.filter(row => ['PLANIFICADO', 'ABIERTO'].includes(row.estado));
  useInitialSchoolYear(eligibleYears, canAssign, yearId, setYear);
  const year = eligibleYears.find(row => row.id === yearId);
  const sections = catalog.sections.filter(row => row.anio_escolar_id === yearId && row.activo
    && (user.nivel_asignado === null || row.nivel === user.nivel_asignado));
  const assignments = catalog.assignments.filter(row => row.usuario_id === user.id);
  useUnsavedChanges(`user-assignment:${user.id}`, Boolean(sectionId || start || end), busy);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAssign || !year || !['PLANIFICADO', 'ABIERTO'].includes(year.estado) || !sections.some(row => row.id === sectionId)
      || !validCivilDate(start) || (end && !validCivilDate(end)) || start < year.fecha_inicio || start > year.fecha_fin
      || (end && (end < start || end > year.fecha_fin))) { setError('Selecciona una sección y fechas válidas dentro del año escolar.'); return; }
    setError('');
    await onSave({ usuario_id: user.id, seccion_id: sectionId, fecha_inicio: start, fecha_fin: end || null });
  }
  return <section aria-label="Asignaciones del usuario" className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="break-words text-xl font-semibold">Asignaciones de {user.nombres} {user.apellidos}</h2>
    {assignments.length ? <ul className="space-y-3">{assignments.map(row => <li key={row.id} className="rounded-lg bg-slate-50 p-3 text-sm">
      <p className="font-semibold">{assignmentSectionLabel(row.seccion_id, catalog)}</p>
      <p>{formatCivilDate(row.fecha_inicio)} — {row.fecha_fin ? formatCivilDate(row.fecha_fin) : 'Sin fecha de fin'}</p>
      {(row.fecha_fin === null || row.fecha_fin >= peruToday()) && <Button variant="secondary" disabled={busy} onClick={() => setEnding(row)}>Finalizar asignación</Button>}
    </li>)}</ul> : <p className="text-sm text-slate-600">Sin asignaciones registradas.</p>}
    <p className="text-sm text-slate-600">Finalizar conserva el historial. Puedes asignar otra sección con la misma cuenta. Desactivar una cuenta conserva sus asignaciones.</p>
    {canAssign ? <form aria-label="Nueva asignación" onSubmit={e => void submit(e)} className="space-y-4">
      <h3 className="font-semibold">Nueva asignación</h3>
      {error && <ErrorState message={error} />}
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold" htmlFor={`${id}-year`}>Año escolar
          <select id={`${id}-year`} className={control} required value={yearId} onChange={e => { setYear(e.target.value); setSection(''); }}>
            <option value="">Selecciona un año</option>{eligibleYears
              .map(row => <option key={row.id} value={row.id}>{row.anio} · {row.estado}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold" htmlFor={`${id}-section`}>Sección
          <select id={`${id}-section`} className={control} required disabled={!yearId} value={sectionId} onChange={e => setSection(e.target.value)}>
            <option value="">Selecciona una sección</option>{sections.map(row => <option key={row.id} value={row.id}>{educationLevelLabels[row.nivel]} · {formatSectionName(row)}</option>)}
          </select>
        </label>
        <FormField label="Fecha de inicio" type="date" required min={year?.fecha_inicio} max={year?.fecha_fin} value={start} onChange={e => setStart(e.target.value)} />
        <FormField label="Fecha de fin" type="date" min={start || year?.fecha_inicio} max={year?.fecha_fin} value={end}
          hint="Opcional. Ambas fechas son inclusivas." onChange={e => setEnd(e.target.value)} />
      </fieldset>
      <Button type="submit" disabled={busy || !sections.length}>{busy ? 'Guardando…' : 'Crear asignación'}</Button>
    </form> : <p className="text-sm text-slate-600">Solo los REGISTRADOR activos pueden recibir nuevas asignaciones.</p>}
    <Button variant="secondary" disabled={busy} onClick={onClose}>Volver al listado</Button>
    {ending && <AssignmentEndDialog assignment={ending} label={assignmentSectionLabel(ending.seccion_id, catalog)} busy={busy}
      onSave={date => onFinalize(ending, date)} onClose={() => setEnding(null)} />}
  </section>;
}
