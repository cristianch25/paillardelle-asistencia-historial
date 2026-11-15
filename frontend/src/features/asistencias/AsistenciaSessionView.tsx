import Button from '../../shared/components/Button';
import type { AttendanceDetail, AttendanceState } from './asistencias.types';
import { draftSummary, type AttendanceChanges } from './attendanceDraft';
import AttendanceStudentRow from './AttendanceStudentRow';

type Props = {
  data: AttendanceDetail;
  changes?: AttendanceChanges;
  editable?: boolean;
  disabled?: boolean;
  updated?: string[];
  created?: boolean;
  onSelect?: (id: string, state: AttendanceState) => void;
  onMarkPending?: () => void;
};

export default function AsistenciaSessionView({ data, changes = {}, editable = false, disabled = false, updated = [], created = false, onSelect, onMarkPending }: Props) {
  const canEdit = editable && data.sesion.estado === 'ABIERTA';
  const local = canEdit ? changes : {};
  const changedCount = Object.keys(local).length;
  const counts = changedCount ? draftSummary(data.padron, local) : data.resumen;
  const summary = [['Total', 'Total', counts.total], ['Presentes', 'Pres.', counts.presentes], ['Tardanzas', 'Tard.', counts.tardanzas],
    ['Faltas', 'Faltas', counts.faltas], ['Sin marcar', 'Sin marcar', counts.pendientes]] as const;
  return (
    <section aria-label="Sesión de asistencia" className="space-y-3">
      <div role="status" className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="font-semibold">{data.sesion.estado === 'CERRADA' ? 'Sesión cerrada'
          : created ? 'Asistencia iniciada' : 'Sesión abierta'}{!canEdit && ' · Solo consulta'}</p>
        {changedCount > 0 && <p className="font-medium text-amber-800">{changedCount} {changedCount === 1 ? 'estudiante sin guardar' : 'estudiantes sin guardar'}</p>}
      </div>
      {canEdit && <p className="text-xs text-slate-600">Las marcas se guardan solo al pulsar «Guardar avances». Si sales con cambios sin guardar, se perderán.</p>}
      <dl aria-label="Resumen de asistencia" className="grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-3 sm:gap-3 sm:p-4">
        {summary.map(([label, short, value]) => <div key={label} className="min-w-0">
          <dt className="min-h-8 text-xs text-slate-600 sm:min-h-0"><span className="sm:hidden" aria-hidden="true">{short}</span>
            <span className="sr-only sm:not-sr-only">{label}</span></dt><dd className="mt-1 text-xl font-semibold">{value}</dd>
        </div>)}
      </dl>
      {changedCount > 0 && <p role="status" className="text-xs text-amber-800">El resumen incluye cambios sin guardar.</p>}
      {canEdit && <div className="space-y-1">
        <Button variant="secondary" className="w-full sm:w-auto" disabled={disabled || !counts.pendientes} onClick={onMarkPending}>
          Marcar todos como presentes
        </Button>
        <p className="text-xs text-slate-600">Solo cambia estudiantes sin marcar, previa confirmación.
          {!counts.pendientes && ' No hay estudiantes sin marcar.'}</p>
      </div>}
      <ul aria-label="Estudiantes y marcas actuales" className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {data.padron.map(row => <AttendanceStudentRow key={row.asistencia_id} row={row}
          state={local[row.asistencia_id] ?? row.estado} changed={local[row.asistencia_id] !== undefined}
          editable={canEdit} disabled={disabled} updated={updated.includes(row.asistencia_id)} onSelect={onSelect} />)}
      </ul>
    </section>
  );
}
