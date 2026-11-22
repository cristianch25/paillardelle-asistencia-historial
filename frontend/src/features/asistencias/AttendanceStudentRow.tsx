import { Check, Clock3, Minus, X } from 'lucide-react';
import type { AttendanceEntry, AttendanceState } from './asistencias.types';
import FormField from '../../shared/components/FormField';
import { justificationError } from './attendanceDraft';
import StudentProfileButton from '../estudiantes/perfil/StudentProfileButton';
import AttendanceHistoryButton from './historial/AttendanceHistoryButton';
import { correctionStudentName, hasStudentNamesake } from './supervision/correctionStudentSearch';

const states = [
  { value: 'PRESENTE', label: 'Presente', Icon: Check, selected: 'border-emerald-700 bg-emerald-50 text-emerald-900' },
  { value: 'TARDANZA', label: 'Tardanza', Icon: Clock3, selected: 'border-amber-700 bg-amber-50 text-amber-900' },
  { value: 'FALTA', label: 'Falta', Icon: X, selected: 'border-red-700 bg-red-50 text-red-900' },
  { value: 'PENDIENTE', label: 'Sin marcar', Icon: Minus, selected: 'border-slate-600 bg-slate-100 text-slate-800' },
] as const;

type Props = {
  profileContext?: { yearId: string; month: string };
  row: AttendanceEntry; state: AttendanceState; changed: boolean; editable: boolean;
  disabled?: boolean; updated?: boolean; justificationDisabled?: boolean; reason?: string;
  onSelect?: (id: string, state: AttendanceState) => void;
  onJustify?: (id: string, reason: string | undefined) => void;
  quick?: boolean;
  compact?: boolean;
  padron?: AttendanceEntry[];
};

export default function AttendanceStudentRow({ row, state, changed, editable, disabled, updated, onSelect,
  reason, onJustify, justificationDisabled = disabled, profileContext, quick = false, compact = false, padron = [row] }: Props) {
  const name = correctionStudentName(row);
  const showCode = row.estudiante.codigo_estudiante && hasStudentNamesake(row, padron);
  const persisted = row.justificada, checked = persisted || reason !== undefined;
  const value = persisted ? row.motivo_justificacion ?? '' : reason;
  const showJustification = (persisted || onJustify) && (state === 'FALTA' || state === 'TARDANZA');
  const clearAction = compact && editable && state !== 'PENDIENTE' && <button type="button" disabled={disabled || persisted}
    onClick={() => onSelect?.(row.asistencia_id, 'PENDIENTE')}
    className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed disabled:opacity-60">
    Quitar marca
  </button>;
  return (
    <li className={quick ? 'flex flex-col gap-3 p-3 sm:p-4'
      : `grid ${compact ? 'gap-2 p-2 sm:p-3' : 'gap-3 p-3 sm:p-4'} md:grid-cols-[minmax(0,1fr)_28rem] md:items-center md:gap-x-5`}>
      <div className="min-w-0">
        <p className={`break-words font-semibold leading-snug ${compact ? 'text-base' : 'text-lg'}`}>{name}</p>
        {quick && <p className="text-sm text-slate-600">Estado actual: <strong>{states.find(item => item.value === row.estado)?.label}</strong></p>}
        {showCode && <p className="mt-1 break-words text-xs text-slate-600">Código: {row.estudiante.codigo_estudiante}</p>}
        {changed && <p className="mt-1 text-xs font-semibold text-amber-800">Sin guardar</p>}
        {updated && <p className="mt-1 text-xs text-slate-600">Actualizado en la consulta</p>}
      </div>
      {editable ? (
        <div role="group" aria-label={`Asistencia de ${name}`} className={compact ? 'grid grid-cols-3 gap-1.5' : quick ? 'grid grid-cols-1 gap-2 sm:grid-cols-3' : 'grid grid-cols-2 gap-2 md:grid-cols-4'}>
          {states.filter(item => !(quick || compact) || item.value !== 'PENDIENTE').map(({ value, label, Icon, selected }) => <button key={value} type="button"
            disabled={disabled || persisted} aria-pressed={state === value} onClick={() => onSelect?.(row.asistencia_id, value)}
            className={`flex min-h-11 min-w-0 items-center justify-center rounded-lg border py-2 ${compact ? 'gap-1 px-1 text-xs sm:text-sm' : 'gap-1.5 px-2 text-sm'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed disabled:opacity-60 ${state === value ? `${selected} font-bold ring-1 ring-current` : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Icon aria-hidden="true" className={`${compact ? 'size-3.5' : 'size-4'} shrink-0`} /><span className={compact ? 'whitespace-nowrap' : undefined}>{label}</span>
          </button>)}
        </div>
      ) : <p className="text-sm font-semibold text-institutional-950">{states.find(item => item.value === state)?.label}</p>}
      {(!compact || (!showJustification && clearAction)) && <div className={`flex flex-wrap items-center gap-2 md:col-span-2 ${compact ? 'justify-end' : ''}`}>
        {clearAction}
        {profileContext && <StudentProfileButton studentId={row.estudiante.id} {...profileContext} disabled={disabled && editable} />}
        {!quick && <AttendanceHistoryButton asistenciaId={row.asistencia_id} version={row.version} />}
      </div>}
      {showJustification && <div className={`space-y-2 md:col-span-2 ${compact ? '' : 'md:max-w-md'}`}>
        <div className={compact ? 'flex items-center justify-between gap-2' : undefined}>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-5" checked={Boolean(checked)} disabled={persisted || justificationDisabled}
            onChange={event => onJustify?.(row.asistencia_id, event.target.checked ? '' : undefined)} />
          Justificada
        </label>
        {compact && clearAction}
        </div>
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
