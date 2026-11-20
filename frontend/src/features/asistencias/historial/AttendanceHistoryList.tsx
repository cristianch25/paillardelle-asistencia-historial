import type { AttendanceHistoryItem } from './attendanceHistory.types';

const stateLabels: Record<string, string> = {
  PENDIENTE: 'Sin marcar',
  PRESENTE: 'Presente',
  TARDANZA: 'Tardanza',
  FALTA: 'Falta',
};

const typeLabels: Record<string, string> = {
  PRIMERA_MARCA: 'Primera marca',
  CAMBIO: 'Modificación de estado',
  JUSTIFICACION: 'Justificación',
  ANULACION: 'Anulación de marca',
  REACTIVACION: 'Reactivación',
};

function formatAuditTime(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

export default function AttendanceHistoryList({ cambios }: { cambios: AttendanceHistoryItem[] }) {
  if (cambios.length === 0) {
    return (
      <p role="status" className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">
        Sin historial disponible.
      </p>
    );
  }

  return (
    <ul aria-label="Cambios registrados" className="space-y-2.5">
      {cambios.map(item => (
        <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-institutional-900">
              {typeLabels[item.tipo] ?? item.tipo}
            </span>
            <span className="text-xs text-slate-500">
              {formatAuditTime(item.fecha_modificacion)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-700">
              {stateLabels[item.estado_anterior] ?? item.estado_anterior} → {stateLabels[item.estado_nuevo] ?? item.estado_nuevo}
            </span>
            {item.justificada_nueva && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
                Justificada
              </span>
            )}
            {item.posterior_cierre && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                Posterior al cierre
              </span>
            )}
            <span className="text-slate-400">
              (v{item.version_anterior} → v{item.version_nueva})
            </span>
          </div>
          {item.motivo_justificacion_nuevo && (
            <p className="text-xs text-slate-700">
              <strong className="font-medium">Motivo de justificación:</strong> {item.motivo_justificacion_nuevo}
            </p>
          )}
          {item.motivo && (
            <p className="text-xs text-slate-700">
              <strong className="font-medium">Motivo de corrección:</strong> {item.motivo}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Por: <strong className="font-medium text-slate-700">{item.modificado_por.nombres} {item.modificado_por.apellidos}</strong> ({item.modificado_por.usuario}) · <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] font-semibold text-slate-700">{item.modificado_por.rol}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
