import { useReducer } from 'react';
import { attendanceDraftKey, draftSummary } from './attendanceDraft';
import { attendanceEditorReducer, createAttendanceEditor } from './attendanceEditorState';
import { useAttendanceSave } from './useAttendanceSave';
import type { AttendanceDetail, AttendanceState } from './asistencias.types';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';

export function useAttendanceDraft(accountId: string | null, data: AttendanceDetail | null, checking: boolean,
  revalidate: () => Promise<void>) {
  const [editor, dispatch] = useReducer(attendanceEditorReducer, null, () => createAttendanceEditor(accountId, data));
  const key = checking && accountId === editor.accountId ? editor.key : attendanceDraftKey(accountId, data);
  // Un nuevo resultado de apertura reemplaza la base; recuperar foco conserva el mismo resultado.
  if (editor.key !== key || editor.accountId !== accountId || (data && editor.source !== data)) {
    dispatch({ type: 'reset', accountId, source: data });
  }
  const count = Object.keys(editor.changes).length;
  const busy = editor.phase === 'saving' || editor.phase === 'closing' || editor.phase === 'refreshing';
  const editable = !checking && Boolean(accountId) && editor.base?.sesion.estado === 'ABIERTA';
  const disabled = !editable || editor.phase !== 'idle' || editor.conflicts.length > 0;
  const saving = useAttendanceSave(editor, dispatch, checking, revalidate);

  useUnsavedChanges(accountId, count > 0, busy);

  function select(id: string, state: AttendanceState) {
    if (!disabled) dispatch({ type: 'select', id, state });
  }
  function markAllPending() {
    if (disabled || !editor.base) return;
    const pending = draftSummary(editor.base.padron, editor.changes).pendientes;
    const message = pending === 1 ? 'Se marcará como presente 1 estudiante sin marcar.'
      : `Se marcarán como presentes ${pending} estudiantes sin marcar.`;
    if (pending && window.confirm(`${message} Las demás marcas se conservarán. ¿Continuar?`)) dispatch({ type: 'bulk' });
  }
  return { ...editor, count, busy, editable, disabled, select, markAllPending, ...saving,
    resolve: (id: string, local: boolean) => dispatch({ type: 'resolve', id, local }) };
}
