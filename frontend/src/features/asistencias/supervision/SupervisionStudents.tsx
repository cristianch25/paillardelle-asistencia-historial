import { useId, useState } from 'react';
import type { AttendanceEntry, AttendanceState } from '../asistencias.types';
import AttendanceStudentRow from '../AttendanceStudentRow';
import EmptyState from '../../../shared/components/EmptyState';

const filters = [ ['Todos', ''], ['Presentes', 'PRESENTE'], ['Tardanzas', 'TARDANZA'],
  ['Faltas', 'FALTA'], ['Pendientes', 'PENDIENTE'] ] as const;

export default function SupervisionStudents({ padron }: { padron: AttendanceEntry[] }) {
  const id = useId();
  const [filter, setFilter] = useState<AttendanceState | ''>('');
  const visible = filter ? padron.filter(row => row.estado === filter) : padron;
  return <section aria-label="Detalle por estudiante" className="space-y-4">
    <label htmlFor={id} className="block text-sm font-semibold">Filtrar estudiantes
      <select id={id} value={filter} onChange={event => setFilter(event.target.value as AttendanceState | '')}
        className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal focus-visible:outline-2 focus-visible:outline-institutional-700 sm:max-w-xs">
        {filters.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <p role="status" className="text-sm text-slate-600">{visible.length} {visible.length === 1 ? 'estudiante' : 'estudiantes'} · {filters.find(([, value]) => value === filter)![0]}</p>
    {visible.length === 0 ? <EmptyState message="No hay estudiantes para el filtro seleccionado." />
      : <ul aria-label="Estudiantes de la sesión" className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {visible.map(row => <AttendanceStudentRow key={row.asistencia_id} row={row} state={row.estado} changed={false} editable={false} />)}
      </ul>}
  </section>;
}
