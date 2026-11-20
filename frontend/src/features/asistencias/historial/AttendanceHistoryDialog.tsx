import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/Button';
import LoadingState from '../../../shared/components/LoadingState';
import ErrorState from '../../../shared/components/ErrorState';
import { apiErrorMessage } from '../../../shared/api/apiError';
import { formatCivilDate } from '../../../shared/dates/civilDate';
import { educationLevelLabels } from '../../organizacion-escolar/secciones/sectionPresentation';
import { getAttendanceHistory } from './attendanceHistory.api';
import AttendanceHistoryList from './AttendanceHistoryList';
import type { AttendanceHistoryResponse } from './attendanceHistory.types';

export default function AttendanceHistoryDialog({
  asistenciaId,
  onClose,
}: {
  asistenciaId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<AttendanceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getAttendanceHistory(asistenciaId)
      .then(res => { if (active) setData(res); })
      .catch(err => { if (active) setError(apiErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [asistenciaId]);

  const studentName = data
    ? [data.estudiante.apellido_paterno, data.estudiante.apellido_materno, data.estudiante.nombres].filter(Boolean).join(' ')
    : '';

  return (
    <dialog
      ref={dialog}
      aria-labelledby="attendance-history-title"
      onCancel={e => { e.preventDefault(); onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40"
    >
      <header className="space-y-1 border-b border-slate-100 pb-3">
        <h2 id="attendance-history-title" className="text-xl font-bold text-institutional-950">
          Historial de modificaciones de asistencia
        </h2>
        {data && (
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{studentName}</p>
            <p className="text-xs">
              {(educationLevelLabels as Record<string, string>)[data.seccion.nivel] ?? data.seccion.nivel} {data.seccion.grado}° "{data.seccion.letra}" · {formatCivilDate(data.fecha)}
            </p>
          </div>
        )}
      </header>

      {loading && <LoadingState message="Cargando historial de cambios…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && data && (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <AttendanceHistoryList cambios={data.cambios} />
        </div>
      )}

      <footer className="flex justify-end pt-2 border-t border-slate-100">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </footer>
    </dialog>
  );
}
