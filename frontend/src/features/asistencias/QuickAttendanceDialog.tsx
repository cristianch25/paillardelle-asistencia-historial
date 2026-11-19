import { useEffect, useId, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { formatCivilDate, peruToday } from '../../shared/dates/civilDate';
import { formatSectionName, educationLevelLabels } from '../organizacion-escolar/secciones/sectionPresentation';
import { useAsistenciaSession } from './useAsistenciaSession';
import { useAttendanceCalendar } from './useAttendanceCalendar';
import { useAttendanceDraft } from './useAttendanceDraft';
import AttendanceStudentRow from './AttendanceStudentRow';
import AttendanceReview from './AttendanceReview';
import AttendanceSaveBar from './AttendanceSaveBar';
import AttendanceCalendarInfo from './AttendanceCalendarInfo';
import type { AssignedStudent } from './assignedStudents.api';

export default function QuickAttendanceDialog({ student, date, onClose, onSaved }: {
  student: AssignedStudent; date: string; onClose: () => void; onSaved: () => void;
}) {
  const { session } = useAuth(), { request } = useNavigationProtection();
  const element = useRef<HTMLDialogElement>(null), title = useId();
  const attendance = useAsistenciaSession(session?.user.id ?? null, student.selection, date, false, true);
  const calendar = useAttendanceCalendar(student.selection, date);
  const draft = useAttendanceDraft(session?.user.id ?? null, attendance.data, false, async () => { onClose(); }, false);
  const row = draft.base?.padron.find(item => item.matricula_id === student.row.matricula_id);
  const day = calendar.data?.dias.find(item => item.fecha === date);
  const writable = student.selection.year.estado === 'ABIERTO' && date <= peruToday()
    && day?.es_lectivo === true && !calendar.loading && !calendar.error;
  function close() { if (!draft.busy) void request(onClose); }
  useEffect(() => {
    const dialog = element.current!, opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { if (draft.success) onSaved(); }, [draft.success, onSaved]);
  return <dialog ref={element} aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-4 text-institutional-950 shadow-xl backdrop:bg-institutional-950/50">
    <div className="flex items-center justify-between gap-3"><h2 id={title} className="text-xl font-bold">Asistencia del estudiante</h2>
      <Button variant="secondary" onClick={close} disabled={draft.busy}>Cerrar</Button></div>
    <p className="break-words text-sm font-medium">{formatSectionName(student.selection.section)} · {educationLevelLabels[student.selection.section.nivel]} · {formatCivilDate(date)}</p>
    <AttendanceCalendarInfo calendar={calendar} fecha={date} />
    {date > peruToday() && day?.es_lectivo !== false && <p role="status">No se puede registrar asistencia de una fecha futura.</p>}
    {attendance.pending && <LoadingState message="Consultando asistencia…" />}
    {attendance.error && <><ErrorState message={attendance.error} />
      <Button variant="secondary" onClick={attendance.retry}>Reintentar consulta</Button></>}
    {draft.phase === 'denied' && <ErrorState message={draft.message} />}
    {draft.base && !row && <ErrorState message="El estudiante ya no está disponible en este padrón." />}
    {row && <>
      <ul aria-label="Asistencia rápida"><AttendanceStudentRow row={row} quick
        state={draft.changes[row.asistencia_id] ?? row.estado} changed={draft.changes[row.asistencia_id] !== undefined}
        editable={writable} disabled={draft.disabled} onSelect={draft.select} /></ul>
      {writable && draft.base && <>
        <AttendanceReview data={draft.base} changes={draft.changes} conflicts={draft.conflicts}
          reasons={draft.reasons} onResolve={draft.resolve} disabled={draft.busy} />
        <AttendanceSaveBar compact count={draft.count} phase={draft.phase} message={draft.message} success={draft.success}
          disabled={draft.saveDisabled} conflicts={draft.conflicts.length} onSave={() => void draft.save()} onRefresh={() => void draft.refresh()} />
      </>}
    </>}
  </dialog>;
}
