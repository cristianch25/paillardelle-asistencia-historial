import { useReducer } from 'react';
import { attendanceDraftKey, draftSummary, justificationError } from './attendanceDraft';
import { attendanceEditorReducer, createAttendanceEditor } from './attendanceEditorState';
import { useAttendanceSave } from './useAttendanceSave';
import { useAttendanceAccess } from './useAttendanceAccess';
import type { AttendanceDetail, AttendanceState } from './asistencias.types';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';

export function useAttendanceDraft(accountId: string | null, data: AttendanceDetail | null, checking: boolean,
  revalidate: () => Promise<void>, allowJustifications = false, bulkIncludesHidden = false, externalBusy = false) {
  const [editor, dispatch] = useReducer(attendanceEditorReducer, null, () => createAttendanceEditor(accountId, data));
  const key = checking && accountId === editor.accountId ? editor.key : attendanceDraftKey(accountId, data);
  // Un nuevo resultado de apertura reemplaza la base; recuperar foco conserva el mismo resultado.
  if (editor.key !== key || editor.accountId !== accountId || (data && editor.source !== data)) {
    dispatch({ type: 'reset', accountId, source: data });
  }
  const count = new Set([...Object.keys(editor.changes), ...Object.keys(editor.reasons)]).size;
  const busy = editor.phase === 'saving' || editor.phase === 'refreshing';
  const editable = !checking && Boolean(accountId) && Boolean(editor.base);
  const disabled = !editable || editor.phase !== 'idle' || editor.conflicts.length > 0;
  const justificationDisabled = checking || !accountId || !editor.base || editor.phase !== 'idle' || editor.conflicts.length > 0;
  const validation = Object.values(editor.reasons).map(justificationError).find(Boolean) ?? '';
  const saving = useAttendanceSave(editor, dispatch, checking, revalidate);
  useAttendanceAccess(editor, checking, saving.validateAccess);

  useUnsavedChanges(accountId, count > 0, busy || externalBusy);

  function justify(id: string, reason: string | undefined) {
    if (justificationDisabled || !allowJustifications) return;
    if (reason === undefined && editor.reasons[id]?.trim() && !window.confirm('¿Desmarcar Justificada y descartar el motivo sin guardar?')) return;
    dispatch({ type: 'justify', id, reason });
  }

  function select(id: string, state: AttendanceState) {
    if (disabled) return;
    if (editor.reasons[id] !== undefined && (state === 'PRESENTE' || state === 'PENDIENTE')) {
      if (!window.confirm('Este estado no admite justificación. ¿Descartar el motivo sin guardar y cambiar la marca?')) return;
    }
    dispatch({ type: 'select', id, state });
  }
  function applyMarkAllPending() {
    if (disabled || !editor.base) return;
    dispatch({ type: 'bulk' });
  }
  function markAllPending() {
    if (disabled || !editor.base) return;
    const pending = draftSummary(editor.base.padron, editor.changes).pendientes;
    const message = pending === 1 ? 'Se marcará como presente 1 estudiante sin marcar.'
      : `Se marcarán como presentes ${pending} estudiantes sin marcar.`;
    const scope = bulkIncludesHidden ? ' También incluye a los estudiantes ocultos por la búsqueda.' : '';
    if (pending && window.confirm(`${message}${scope} Las demás marcas se conservarán. ¿Continuar?`)) applyMarkAllPending();
  }
  return { ...editor, count, busy, editable, disabled, select, markAllPending, applyMarkAllPending, ...saving, justify, validation, justificationDisabled,
    saveDisabled: justificationDisabled || Boolean(validation),
    resolve: (id: string, local: boolean) => dispatch({ type: 'resolve', id, local }) };
}
