import { Check, Clock3, Minus, X } from 'lucide-react';
import type { AttendanceEntry, AttendanceState } from './asistencias.types';

const states = [
  { value: 'PRESENTE', label: 'Presente', Icon: Check, selected: 'border-emerald-700 bg-emerald-50 text-emerald-900' },
  { value: 'TARDANZA', label: 'Tardanza', Icon: Clock3, selected: 'border-amber-700 bg-amber-50 text-amber-900' },
  { value: 'FALTA', label: 'Falta', Icon: X, selected: 'border-red-700 bg-red-50 text-red-900' },
  { value: 'PENDIENTE', label: 'Sin marcar', Icon: Minus, selected: 'border-slate-600 bg-slate-100 text-slate-800' },
] as const;

type Props = {
  row: AttendanceEntry;
  state: AttendanceState;
  changed: boolean;
  editable: boolean;
  disabled?: boolean;
  updated?: boolean;
  onSelect?: (id: string, state: AttendanceState) => void;
};

export default function AttendanceStudentRow({ row, state, changed, editable, disabled, updated, onSelect }: Props) {
  const name = [row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ');
  return (
    <li className="space-y-3 p-3 sm:p-4 md:flex md:items-center md:justify-between md:gap-5 md:space-y-0">
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{name}</p>
        {row.estudiante.codigo_estudiante && <p className="mt-1 break-words text-xs text-slate-600">Código: {row.estudiante.codigo_estudiante}</p>}
        {changed && <p className="mt-1 text-xs font-semibold text-amber-800">Sin guardar</p>}
        {updated && <p className="mt-1 text-xs text-slate-600">Actualizado en la consulta</p>}
      </div>
      {editable ? (
        <div role="group" aria-label={`Asistencia de ${name}`} className="grid grid-cols-2 gap-2 md:w-[28rem] md:shrink-0 md:grid-cols-4">
          {states.map(({ value, label, Icon, selected }) => <button key={value} type="button"
            disabled={disabled} aria-pressed={state === value} onClick={() => onSelect?.(row.asistencia_id, value)}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed disabled:opacity-60 ${state === value ? `${selected} font-bold ring-1 ring-current` : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Icon aria-hidden="true" className="size-4 shrink-0" /><span>{label}</span>
          </button>)}
        </div>
      ) : <p className="text-sm font-semibold text-institutional-950">{states.find(item => item.value === state)?.label}</p>}
    </li>
  );
}
