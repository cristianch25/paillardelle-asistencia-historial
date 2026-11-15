import Button from '../../shared/components/Button';
import type { AttendanceDetail, AttendanceState } from './asistencias.types';
import type { AttendanceChanges } from './attendanceDraft';

const labels: Record<AttendanceState, string> = {
  PRESENTE: 'Presente', TARDANZA: 'Tardanza', FALTA: 'Falta', PENDIENTE: 'Sin marcar',
};
type Props = { data: AttendanceDetail; changes: AttendanceChanges; conflicts: string[];
  onResolve: (id: string, local: boolean) => void; disabled: boolean };

export default function AttendanceReview({ data, changes, conflicts, onResolve, disabled }: Props) {
  if (!conflicts.length) return null;
  const closed = data.sesion.estado === 'CERRADA';
  return (
    <section id="attendance-review" tabIndex={-1} aria-label="Revisión de diferencias" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <h3 className="font-semibold">{closed ? 'Selecciones que quedaron sin guardar' : 'Revisa las diferencias antes de guardar'}</h3>
      {data.padron.filter(row => conflicts.includes(row.asistencia_id)).map(row => <div key={row.asistencia_id} className="space-y-2">
        <p className="break-words font-medium">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}</p>
        <p className="text-sm">Estado actual: <strong>{labels[row.estado]}</strong> · Tu selección: <strong>{labels[changes[row.asistencia_id]!]}</strong></p>
        {!closed && <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={disabled} onClick={() => onResolve(row.asistencia_id, false)}>Conservar actual</Button>
          <Button variant="secondary" disabled={disabled} onClick={() => onResolve(row.asistencia_id, true)}>Conservar mi selección</Button>
        </div>}
      </div>)}
    </section>
  );
}
