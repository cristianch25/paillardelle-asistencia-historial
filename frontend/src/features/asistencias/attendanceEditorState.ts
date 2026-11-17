import { attendanceDraftKey, markPendingPresent, selectAttendanceState, type AttendanceChanges } from './attendanceDraft';
import type { AttendanceDetail, AttendanceState } from './asistencias.types';
import { reconcileAttendance } from './attendanceReconciliation';

export type EditorPhase = 'idle' | 'saving' | 'checking-access' | 'refreshing' | 'refresh-required' | 'denied';
export type AttendanceEditor = {
  accountId: string | null; key: string | null; source: AttendanceDetail | null;
  base: AttendanceDetail | null; changes: AttendanceChanges; conflicts: string[]; updated: string[];
  reasons: Record<string, string>;
  phase: EditorPhase; message: string; success: boolean; epoch: object;
};
export function createAttendanceEditor(accountId: string | null, source: AttendanceDetail | null): AttendanceEditor {
  return { accountId, key: attendanceDraftKey(accountId, source), source, base: source,
    changes: {}, reasons: {}, conflicts: [], updated: [], phase: 'idle', message: '', success: false, epoch: {} };
}
export type EditorAction =
  | { type: 'reset'; accountId: string | null; source: AttendanceDetail | null }
  | { type: 'select'; id: string; state: AttendanceState }
  | { type: 'justify'; id: string; reason: string | undefined }
  | { type: 'bulk' }
  | { type: 'discard'; epoch: object }
  | { type: 'resolve'; id: string; local: boolean }
  | { type: 'phase'; epoch: object; phase: EditorPhase; message: string }
  | { type: 'saved' | 'refreshed'; epoch: object; data: AttendanceDetail; message: string };

export function attendanceEditorReducer(editor: AttendanceEditor, action: EditorAction): AttendanceEditor {
  if (action.type === 'reset') return createAttendanceEditor(action.accountId, action.source);
  if ('epoch' in action && action.epoch !== editor.epoch) return editor;
  if (action.type === 'discard') return { ...editor, changes: {}, reasons: {}, conflicts: [], updated: [], success: false };
  if (action.type === 'phase') return { ...editor, phase: action.phase, message: action.message, success: false,
    ...(action.phase === 'denied' ? { base: null, changes: {}, reasons: {}, conflicts: [], updated: [] } : {}) };
  if (action.type === 'saved') return { ...editor, base: action.data, changes: {}, reasons: {}, conflicts: [], updated: [],
    phase: 'idle', message: action.message, success: true };
  if (action.type === 'refreshed') {
    if (!editor.base) return editor;
    const reconciled = reconcileAttendance(editor.base, editor.changes, action.data, editor.reasons);
    return { ...editor, ...reconciled, conflicts: [...new Set([...reconciled.conflicts,
      ...editor.conflicts.filter(id => reconciled.changes[id] !== undefined || reconciled.reasons[id] !== undefined)])],
      phase: 'idle', message: action.message, success: false };
  }
  if (!editor.base || editor.phase !== 'idle') return editor;
  if (action.type === 'resolve') {
    if (!editor.conflicts.includes(action.id)) return editor;
    if (action.local && editor.base.padron.find(row => row.asistencia_id === action.id)?.justificada) return editor;
    const changes = { ...editor.changes }, reasons = { ...editor.reasons };
    if (!action.local) { delete changes[action.id]; delete reasons[action.id]; }
    return { ...editor, changes, reasons, conflicts: editor.conflicts.filter(id => id !== action.id), success: false };
  }
  if (editor.conflicts.length) return editor;
  if (action.type === 'justify') {
    const row = editor.base.padron.find(item => item.asistencia_id === action.id);
    if (!row || row.justificada || !['FALTA', 'TARDANZA'].includes(editor.changes[action.id] ?? row.estado)) return editor;
    const reasons = { ...editor.reasons };
    if (action.reason === undefined) delete reasons[action.id]; else reasons[action.id] = action.reason;
    return { ...editor, reasons, message: '', success: false };
  }
  const changes = action.type === 'select'
    ? selectAttendanceState(editor.base.padron, editor.changes, action.id, action.state)
    : markPendingPresent(editor.base.padron, editor.changes);
  const reasons = { ...editor.reasons };
  if (action.type === 'select' && ['PRESENTE', 'PENDIENTE'].includes(action.state)) delete reasons[action.id];
  return { ...editor, changes, reasons, message: '', success: false };
}
