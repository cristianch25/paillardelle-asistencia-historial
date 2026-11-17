import { Check, Clock3, Minus, X } from 'lucide-react';
import type { AttendanceEntry, AttendanceState } from './asistencias.types';
import FormField from '../../shared/components/FormField';
import { justificationError } from './attendanceDraft';

const states = [
  { value: 'PRESENTE', label: 'Presente', Icon: Check, selected: 'border-emerald-700 bg-emerald-50 text-emerald-900' },
  { value: 'TARDANZA', label: 'Tardanza', Icon: Clock3, selected: 'border-amber-700 bg-amber-50 text-amber-900' },
  { value: 'FALTA', label: 'Falta', Icon: X, selected: 'border-red-700 bg-red-50 text-red-900' },
  { value: 'PENDIENTE', label: 'Sin marcar', Icon: Minus, selected: 'border-slate-600 bg-slate-100 text-slate-800' },
] as const;

type Props = {
  row: AttendanceEntry; state: AttendanceState; changed: boolean; editable: boolean;
  disabled?: boolean; updated?: boolean; justificationDisabled?: boolean; reason?: string;
  onSelect?: (id: string, state: AttendanceState) => void;
  onJustify?: (id: string, reason: string | undefined) => void;
};

export default function AttendanceStudentRow({ row, state, changed, editable, disabled, updated, onSelect,
  reason, onJustify, justificationDisabled = disabled }: Props) {
  const name = [row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ');
  const persisted = row.justificada, checked = persisted || reason !== undefined;
  const value = persisted ? row.motivo_justificacion ?? '' : reason;
  return (
    <li className="grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_28rem] md:items-center md:gap-x-5">
      <div className="min-w-0">
        <p className="break-words font-medium">{name}</p>
        {row.estudiante.codigo_estudiante && <p className="mt-1 break-words text-xs text-slate-600">Código: {row.estudiante.codigo_estudiante}</p>}
        {changed && <p className="mt-1 text-xs font-semibold text-amber-800">Sin guardar</p>}
        {updated && <p className="mt-1 text-xs text-slate-600">Actualizado en la consulta</p>}
      </div>
      {editable ? (
        <div role="group" aria-label={`Asistencia de ${name}`} className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {states.map(({ value, label, Icon, selected }) => <button key={value} type="button"
            disabled={disabled || persisted} aria-pressed={state === value} onClick={() => onSelect?.(row.asistencia_id, value)}
            className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed disabled:opacity-60 ${state === value ? `${selected} font-bold ring-1 ring-current` : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Icon aria-hidden="true" className="size-4 shrink-0" /><span>{label}</span>
          </button>)}
        </div>
      ) : <p className="text-sm font-semibold text-institutional-950">{states.find(item => item.value === state)?.label}</p>}
      {(persisted || onJustify) && (state === 'FALTA' || state === 'TARDANZA') && <div className="space-y-2 md:col-span-2 md:max-w-md">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-5" checked={Boolean(checked)} disabled={persisted || justificationDisabled}
            onChange={event => onJustify?.(row.asistencia_id, event.target.checked ? '' : undefined)} />
          Justificada
        </label>
        {checked && <FormField label="Motivo" required={!persisted} value={value ?? ''} readOnly={persisted}
          disabled={!persisted && justificationDisabled}
          onChange={event => onJustify?.(row.asistencia_id, event.target.value)}
          error={!persisted && value !== undefined ? justificationError(value) || undefined : undefined}
          hint={persisted ? 'Justificación guardada. Estado y motivo de solo lectura.' : 'Justificación pendiente de guardar.'} />}
      </div>}
      {reason !== undefined && state !== 'FALTA' && state !== 'TARDANZA' && <p role="status" className="text-xs text-amber-800 md:col-span-2">
        La marca cambió. Conservamos el motivo pendiente; revisa las diferencias antes de guardar.
      </p>}
    </li>
  );
}
