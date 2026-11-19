import { attendanceDraftKey, justificationError, type AttendanceChanges } from './attendanceDraft';
import type { AttendanceDetail, AttendancePatch } from './asistencias.types';
import { alignAttendancePreview } from './attendancePreview';

export function attendancePatch(base: AttendanceDetail, changes: AttendanceChanges, reasons: Record<string, string> = {}): AttendancePatch {
  return { version: base.sesion.version, cambios: base.padron
    .filter(row => (changes[row.asistencia_id] !== undefined && changes[row.asistencia_id] !== row.estado)
      || (reasons[row.asistencia_id] !== undefined && (!row.justificada || reasons[row.asistencia_id]!.trim() !== row.motivo_justificacion)))
    .map(row => {
      const estado = changes[row.asistencia_id] ?? row.estado, reason = reasons[row.asistencia_id];
      if (row.justificada) throw new Error('Una asistencia justificada es de solo lectura.');
      if (reason !== undefined && (justificationError(reason) || !['FALTA', 'TARDANZA'].includes(estado))) {
        throw new Error('La justificación requiere Falta o Tardanza y un motivo válido de hasta 500 caracteres.');
      }
      return { asistencia_id: row.asistencia_id, version: row.version, estado,
        ...(reason !== undefined ? { justificada: true, motivo_justificacion: reason.trim() } : {}) };
    }) };
}

export function assertAttendanceResponse(before: AttendanceDetail, current: AttendanceDetail) {
  before = alignAttendancePreview(before, current).before;
  if (attendanceDraftKey('scope', before) !== attendanceDraftKey('scope', current)
    || before.padron.length !== current.padron.length
    || new Set(current.padron.map(row => row.asistencia_id)).size !== current.padron.length
    || before.padron.some(row => !current.padron.some(item => item.asistencia_id === row.asistencia_id
      && item.matricula_id === row.matricula_id && item.matricula_seccion_id === row.matricula_seccion_id))) {
    throw new Error('La respuesta no corresponde a la sesión y su padrón.');
  }
}

export function assertAttendanceSaved(before: AttendanceDetail, current: AttendanceDetail, body: AttendancePatch) {
  assertAttendanceResponse(before, current);
  if (current.sesion.version !== before.sesion.version + 1 || current.sesion.estado !== before.sesion.estado
    || body.cambios.some(change => {
      const row = current.padron.find(item => item.asistencia_id === change.asistencia_id)!;
      const original = before.padron.find(item => item.asistencia_id === change.asistencia_id)!;
      return row.version !== change.version + 1 || row.estado !== change.estado
        || Boolean(row.justificada) !== (change.justificada ?? Boolean(original.justificada))
        || (row.motivo_justificacion ?? null) !== (change.justificada ? change.motivo_justificacion : original.motivo_justificacion ?? null);
    })) throw new Error('El guardado no fue confirmado con los valores solicitados.');
}

export function reconcileAttendance(before: AttendanceDetail, changes: AttendanceChanges, current: AttendanceDetail,
  reasons: Record<string, string> = {}) {
  ({ before, changes, reasons } = alignAttendancePreview(before, current, changes, reasons));
  assertAttendanceResponse(before, current);
  const remaining: Record<string, AttendanceDetail['padron'][number]['estado']> = {}, conflicts: string[] = [], updated: string[] = [];
  const previous = new Map(before.padron.map(row => [row.asistencia_id, row]));
  const remainingReasons: Record<string, string> = {};
  for (const row of current.padron) {
    const desired = changes[row.asistencia_id], original = previous.get(row.asistencia_id)!;
    const changed = row.version !== original.version || row.estado !== original.estado
      || Boolean(row.justificada) !== Boolean(original.justificada) || row.motivo_justificacion !== original.motivo_justificacion;
    if (changed) updated.push(row.asistencia_id);
    const statePending = desired !== undefined && desired !== row.estado;
    const reason = reasons[row.asistencia_id];
    const reasonPending = reason !== undefined && !(row.justificada && row.motivo_justificacion === reason.trim()
      && (!desired || desired === row.estado));
    if (statePending) remaining[row.asistencia_id] = desired;
    if (reasonPending) remainingReasons[row.asistencia_id] = reason;
    if ((statePending || reasonPending) && changed) {
      conflicts.push(row.asistencia_id);
    }
  }
  return { base: current, changes: remaining, reasons: remainingReasons, conflicts, updated };
}
