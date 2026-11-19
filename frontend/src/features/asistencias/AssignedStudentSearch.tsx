import { useState } from 'react';
import FormField from '../../shared/components/FormField';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { validCivilDate } from '../../shared/dates/civilDate';
import { useAssignedStudentSearch } from './useAssignedStudentSearch';
import { correctionStudentName } from './supervision/correctionStudentSearch';
import { formatSectionName, educationLevelLabels } from '../organizacion-escolar/secciones/sectionPresentation';
import QuickAttendanceDialog from './QuickAttendanceDialog';
import { correctionLabel } from './attendanceDraft';
import type { AssignedStudent } from './assignedStudents.api';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';

export default function AssignedStudentSearch({ years, date, onDateChange, onSaved }: {
  years: SchoolYear[]; date: string; onDateChange: (date: string) => void; onSaved: () => void;
}) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<AssignedStudent | null>(null);
  const [message, setMessage] = useState('');
  const search = useAssignedStudentSearch(years, date, query);
  return <section aria-label="Buscar entre mis estudiantes" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <FormField label="Fecha de asistencia" type="date" value={date} onChange={event => onDateChange(event.target.value)}
      error={validCivilDate(date) ? undefined : 'Selecciona una fecha válida.'} />
    <FormField label="Buscar estudiante" type="search" value={query} placeholder="Nombre o apellidos"
      onChange={event => { setQuery(event.target.value); setMessage(''); }} />
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {query.trim() && <>
      {search.loading && <LoadingState message="Buscando en tus secciones…" />}
      {search.error && <><ErrorState message={search.error} /><Button variant="secondary" onClick={search.refresh}>Reintentar búsqueda</Button></>}
      {!search.loading && !search.error && <>
        <p role="status" className="text-sm text-slate-600">{search.matches.length} coincidencias</p>
        <ul aria-label="Coincidencias de mis estudiantes" className="max-h-80 divide-y divide-slate-200 overflow-y-auto">
          {search.matches.map(student => <li key={`${student.selection.section.id}:${student.row.matricula_id}`}>
            <button type="button" onClick={() => setSelected(student)} className="min-h-14 w-full space-y-1 rounded-lg p-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-institutional-700">
              <span className="block break-words font-semibold">{correctionStudentName(student.row)}</span>
              <span className="block text-sm text-slate-600">{formatSectionName(student.selection.section)} · {educationLevelLabels[student.selection.section.nivel]} · {correctionLabel(student.row.estado)}</span>
            </button>
          </li>)}
        </ul>
      </>}
    </>}
    {selected && <QuickAttendanceDialog key={`${selected.row.matricula_id}:${date}`} student={selected} date={date}
      onClose={() => setSelected(null)} onSaved={() => {
        setSelected(null); setMessage('Asistencia guardada.'); search.refresh(); onSaved();
      }} />}
  </section>;
}
