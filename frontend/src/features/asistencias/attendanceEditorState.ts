import { attendanceDraftKey, markPendingPresent, selectAttendanceState, type AttendanceChanges } from './attendanceDraft';
import type { AttendanceDetail, AttendanceState } from './asistencias.types';
import { reconcileAttendance } from './attendanceReconciliation';

export type EditorPhase = 'idle' | 'saving' | 'closing' | 'checking-access' | 'refreshing' | 'refresh-required' | 'denied';
export type AttendanceEditor = {
  accountId: string | null; key: string | null; source: AttendanceDetail | null;
  base: AttendanceDetail | null; changes: AttendanceChanges; conflicts: string[]; updated: string[];
  phase: EditorPhase; message: string; success: boolean; closePending: boolean; epoch: object;
};
export function createAttendanceEditor(accountId: string | null, source: AttendanceDetail | null): AttendanceEditor {
  return { accountId, key: attendanceDraftKey(accountId, source), source, base: source,
    changes: {}, conflicts: [], updated: [], phase: 'idle', message: '', success: false, closePending: false, epoch: {} };
}
export type EditorAction =
  | { type: 'reset'; accountId: string | null; source: AttendanceDetail | null }
  | { type: 'select'; id: string; state: AttendanceState }
  | { type: 'bulk' }
  | { type: 'discard'; epoch: object }
  | { type: 'resolve'; id: string; local: boolean }
  | { type: 'phase'; epoch: object; phase: EditorPhase; message: string }
  | { type: 'saved' | 'refreshed'; epoch: object; data: AttendanceDetail; message: string };

export function attendanceEditorReducer(editor: AttendanceEditor, action: EditorAction): AttendanceEditor {
  if (action.type === 'reset') return createAttendanceEditor(action.accountId, action.source);
  if ('epoch' in action && action.epoch !== editor.epoch) return editor;
  if (action.type === 'discard') return { ...editor, changes: {}, conflicts: [], updated: [], success: false };
  if (action.type === 'phase') return { ...editor, phase: action.phase, message: action.message, success: false,
    closePending: action.phase === 'closing' || (!['idle', 'denied'].includes(action.phase) && editor.closePending),
    ...(action.phase === 'denied' ? { base: null, changes: {}, conflicts: [], updated: [] } : {}) };
  if (action.type === 'saved') return { ...editor, base: action.data, changes: {}, conflicts: [], updated: [],
    phase: 'idle', message: action.message, success: true, closePending: false };
  if (action.type === 'refreshed') {
    if (!editor.base) return editor;
    const reconciled = reconcileAttendance(editor.base, editor.changes, action.data);
    return { ...editor, ...reconciled, conflicts: [...new Set([...reconciled.conflicts,
      ...editor.conflicts.filter(id => reconciled.changes[id] !== undefined)])],
      phase: 'idle', message: action.message, success: false, closePending: false };
  }
  if (!editor.base || editor.base.sesion.estado !== 'ABIERTA' || editor.phase !== 'idle') return editor;
  if (action.type === 'resolve') {
    if (!editor.conflicts.includes(action.id)) return editor;
    const changes = { ...editor.changes };
    if (!action.local) delete changes[action.id];
    return { ...editor, changes, conflicts: editor.conflicts.filter(id => id !== action.id), success: false };
  }
  if (editor.conflicts.length) return editor;
  const changes = action.type === 'select'
    ? selectAttendanceState(editor.base.padron, editor.changes, action.id, action.state)
    : markPendingPresent(editor.base.padron, editor.changes);
  return { ...editor, changes, message: '', success: false };
}
