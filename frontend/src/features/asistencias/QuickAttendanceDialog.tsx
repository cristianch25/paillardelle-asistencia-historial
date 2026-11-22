import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { peruToday } from '../../shared/dates/civilDate';
import { formatRegistrarSectionName, educationLevelLabels } from '../organizacion-escolar/secciones/sectionPresentation';
import { correctionStudentName } from './supervision/correctionStudentSearch';
import { useAsistenciaSession } from './useAsistenciaSession';
import { useAttendanceCalendar } from './useAttendanceCalendar';
import { useAttendanceDraft } from './useAttendanceDraft';
import AttendanceStudentRow from './AttendanceStudentRow';
import AttendanceReview from './AttendanceReview';
import AttendanceSaveBar from './AttendanceSaveBar';
import AttendanceCalendarInfo from './AttendanceCalendarInfo';
import AttendanceJustifyDialog from './AttendanceJustifyDialog';
import QuickGuardianContact from './QuickGuardianContact';
import type { AssignedStudent } from './assignedStudents.api';

export default function QuickAttendanceDialog({ student, date, onClose, onSaved }: {
  student: AssignedStudent; date: string; onClose: () => void; onSaved: () => void;
}) {
  const { session } = useAuth(), { request } = useNavigationProtection();
  const [phoneBusy, setPhoneBusy] = useState(false), phoneOperation = useRef(false);
  const savedBase = useRef<unknown>(null);
  function phoneActivity(value: boolean) { phoneOperation.current = value; setPhoneBusy(value); }
  const element = useRef<HTMLDialogElement>(null), title = useId();
  const [justifyOpen, setJustifyOpen] = useState(false);
  const attendance = useAsistenciaSession(session?.user.id ?? null, student.selection, date, false, true);
  const calendar = useAttendanceCalendar(student.selection, date);
  const draft = useAttendanceDraft(session?.user.id ?? null, attendance.data, phoneBusy,
    async () => { if (!phoneOperation.current) onClose(); }, true, false, phoneBusy);
  const row = draft.base?.padron.find(item => item.matricula_id === student.row.matricula_id);
  const day = calendar.data?.dias.find(item => item.fecha === date);
  const writable = student.selection.year.estado === 'ABIERTO' && date <= peruToday()
    && day?.es_lectivo === true && !calendar.loading && !calendar.error;
  function close() { if (!draft.busy && !phoneOperation.current) void request(onClose); }
  useEffect(() => {
    const dialog = element.current!, opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    if (draft.success && draft.base && savedBase.current !== draft.base) { savedBase.current = draft.base; onSaved(); }
  }, [draft.success, draft.base, onSaved]);

  const currentState = row ? (draft.changes[row.asistencia_id] ?? row.estado) : 'PENDIENTE';
  const canJustify = writable && (currentState === 'FALTA' || currentState === 'TARDANZA');
  const isPersisted = row?.justificada === true;
  const draftedReason = row ? draft.reasons[row.asistencia_id] : undefined;
  const studentName = correctionStudentName(student.row);

  return <dialog ref={element} aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-4 text-institutional-950 shadow-xl backdrop:bg-institutional-950/50">
    <div className="flex items-center justify-between gap-3"><h2 id={title} className="text-xl font-bold">Asistencia del estudiante</h2>
      <Button variant="secondary" onClick={close} disabled={draft.busy || phoneBusy}>Cerrar</Button></div>
    <p className="break-words text-sm font-medium">Sección: {formatRegistrarSectionName(student.selection.section)} · {educationLevelLabels[student.selection.section.nivel]}</p>
    <AttendanceCalendarInfo calendar={calendar} fecha={date} />
    {date > peruToday() && day?.es_lectivo !== false && <p role="status">No se puede registrar asistencia de una fecha futura.</p>}
    {attendance.pending && <LoadingState message="Consultando asistencia…" />}
    {attendance.error && <><ErrorState message={attendance.error} />
      <Button variant="secondary" onClick={attendance.retry}>Reintentar consulta</Button></>}
    {draft.phase === 'denied' && <ErrorState message={draft.message} />}
    {draft.base && !row && <ErrorState message="El estudiante ya no está disponible en este padrón." />}
    {row && <>
      <QuickGuardianContact studentId={student.row.estudiante.id} yearId={student.selection.year.id}
        month={date.slice(0, 7)} busy={draft.busy || draft.phase === 'checking-access'} onBusyChange={phoneActivity} />
      <ul aria-label="Asistencia rápida"><AttendanceStudentRow row={row} padron={draft.base?.padron} quick
        state={currentState} changed={draft.changes[row.asistencia_id] !== undefined || draftedReason !== undefined}
        editable={writable} disabled={draft.disabled || phoneBusy} onSelect={draft.select} /></ul>

      {canJustify && (
        <div className="space-y-2">
          {isPersisted ? (
            <div className="rounded-lg bg-slate-100 p-2.5 text-xs text-slate-700 border border-slate-200">
              <span className="font-semibold text-emerald-800">Justificada (guardada):</span> {row.motivo_justificacion}
            </div>
          ) : draftedReason !== undefined ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900 border border-emerald-200">
              <div className="min-w-0 flex-1 break-words">
                <span className="font-semibold">Justificación pendiente:</span> "{draftedReason}"
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setJustifyOpen(true)}>Editar motivo</Button>
                <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => draft.justify(row.asistencia_id, undefined)}>Quitar</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="text-xs px-2.5 py-1" disabled={draft.disabled || phoneBusy} onClick={() => setJustifyOpen(true)}>
                Justificar {currentState === 'FALTA' ? 'falta' : 'tardanza'}
              </Button>
            </div>
          )}
        </div>
      )}

      {writable && draft.base && <>
        <AttendanceReview data={draft.base} changes={draft.changes} conflicts={draft.conflicts}
          reasons={draft.reasons} onResolve={draft.resolve} disabled={draft.busy} />
        <AttendanceSaveBar compact count={draft.count} phase={draft.phase} message={draft.message} success={draft.success}
          disabled={draft.saveDisabled || phoneBusy} conflicts={draft.conflicts.length} onSave={() => { if (!phoneOperation.current) void draft.save(); }} onRefresh={() => void draft.refresh()} />
      </>}

      {row && (
        <AttendanceJustifyDialog
          isOpen={justifyOpen}
          initialReason={draftedReason ?? ''}
          state={currentState}
          studentName={studentName}
          onSave={reason => {
            draft.justify(row.asistencia_id, reason);
            setJustifyOpen(false);
          }}
          onCancel={() => setJustifyOpen(false)}
        />
      )}
    </>}
  </dialog>;
}
