import { useAuth } from '../../auth/AuthContext';
import type { AttendanceDetail } from '../asistencias.types';
import { useAttendanceDraft } from '../useAttendanceDraft';
import AsistenciaSessionView from '../AsistenciaSessionView';
import AttendanceStudentRow from '../AttendanceStudentRow';
import AttendanceSaveBar from '../AttendanceSaveBar';
import AttendanceReview from '../AttendanceReview';
import SupervisionSummary from '../supervision/SupervisionSummary';
import ErrorState from '../../../shared/components/ErrorState';
import { useState } from 'react';

// Solo compone la edición de registros existentes; no abre ni crea sesiones.
export default function AdminAttendanceEditor({ initial, entryId, revalidate }: {
  initial: AttendanceDetail; entryId?: string; revalidate: () => Promise<void>;
}) {
  const { session } = useAuth();
  const allowed = session && ['ADMIN', 'SUBDIRECCION'].includes(session.user.rol);
  const draft = useAttendanceDraft(allowed ? session.user.id : null, initial, false, revalidate, true, !entryId);
  const [query, setQuery] = useState('');
  if (!allowed) return null;
  if (!draft.base) return <ErrorState message={draft.message || 'La asistencia ya no está disponible.'} />;
  const entry = entryId ? draft.base.padron.find(row => row.asistencia_id === entryId) : null;
  if (entryId && !entry) return <ErrorState message="La asistencia del estudiante ya no está disponible." />;
  return <section aria-label="Edición autorizada de asistencia" className="space-y-4">
    <AttendanceReview data={draft.base} changes={draft.changes} conflicts={draft.conflicts} reasons={draft.reasons}
      onResolve={draft.resolve} disabled={draft.busy} />
    {entry ? <ul className="rounded-xl border border-slate-200 bg-white"><AttendanceStudentRow row={entry} padron={draft.base.padron}
      state={draft.changes[entry.asistencia_id] ?? entry.estado} changed={draft.changes[entry.asistencia_id] !== undefined || draft.reasons[entry.asistencia_id] !== undefined}
      editable={draft.editable} disabled={draft.disabled} onSelect={draft.select} onJustify={draft.justify}
      reason={draft.reasons[entry.asistencia_id]} justificationDisabled={draft.justificationDisabled} /></ul> : <>
      <SupervisionSummary resumen={draft.base.resumen} compact />
      <AsistenciaSessionView administrativeDetail data={draft.base} changes={draft.changes} editable={draft.editable} disabled={draft.disabled}
        reasons={draft.reasons} onJustify={draft.justify} justificationDisabled={draft.justificationDisabled}
        onSelect={draft.select} onMarkPending={draft.markAllPending} query={query} onSearch={setQuery} pendingCount={draft.count} />
    </>}
    <AttendanceSaveBar administrativeDetail={!entryId} count={draft.count} phase={draft.phase} message={draft.message} success={draft.success}
      conflicts={draft.conflicts.length} disabled={draft.saveDisabled} validation={draft.validation}
      onSave={() => void draft.save()} onRefresh={() => void draft.refresh()} />
  </section>;
}
