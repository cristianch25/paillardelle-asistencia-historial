import Button from '../../shared/components/Button';
import type { EditorPhase } from './attendanceEditorState';

type Props = {
  count: number; phase: EditorPhase; message: string; success: boolean; disabled: boolean;
  conflicts: number;
  validation?: string;
  onSave: () => void; onRefresh: () => void;
};
export default function AttendanceSaveBar({ count, phase, message, success, disabled, conflicts, onSave, onRefresh,
  validation = '' }: Props) {
  const busy = phase === 'saving' || phase === 'checking-access' || phase === 'refreshing';
  return (
    <div aria-label="Guardado de asistencia" aria-busy={busy}
      className="sticky bottom-2 z-10 space-y-2 rounded-xl border border-slate-300 bg-white p-3 shadow-lg sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{count} {count === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}</p>
        <Button className="w-full sm:w-auto" disabled={disabled || !count || phase !== 'idle'} onClick={onSave}>
          {phase === 'saving' ? 'Guardando cambios…' : 'Guardar cambios'}
        </Button>
      </div>
      {validation && <p role="alert" className="text-sm text-amber-800">{validation}</p>}
      {message && <p role={success || busy ? 'status' : 'alert'}
        className={`break-words text-sm ${success ? 'text-emerald-800' : 'text-slate-700'}`}>{message}</p>}
      {conflicts > 0 && <button type="button" onClick={() => {
        const review = document.getElementById('attendance-review'); review?.focus(); review?.scrollIntoView({ block: 'center' });
      }} className="inline-flex min-h-11 items-center text-sm font-semibold text-institutional-800 underline">
        Revisar diferencias ({conflicts})
      </button>}
      {phase === 'refresh-required' && <Button variant="secondary" className="w-full sm:w-auto" onClick={onRefresh}>
        Consultar estado actual
      </Button>}
    </div>
  );
}
