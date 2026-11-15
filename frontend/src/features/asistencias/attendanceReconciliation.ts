import { attendanceDraftKey, type AttendanceChanges } from './attendanceDraft';
import type { AttendanceDetail, AttendancePatch } from './asistencias.types';

export function attendancePatch(base: AttendanceDetail, changes: AttendanceChanges): AttendancePatch {
  return { version: base.sesion.version, cambios: base.padron
    .filter(row => changes[row.asistencia_id] !== undefined && changes[row.asistencia_id] !== row.estado)
    .map(row => ({ asistencia_id: row.asistencia_id, version: row.version, estado: changes[row.asistencia_id]! })) };
}

export function assertAttendanceResponse(before: AttendanceDetail, current: AttendanceDetail) {
  if (attendanceDraftKey('scope', before) !== attendanceDraftKey('scope', current)
    || before.padron.length !== current.padron.length
    || new Set(current.padron.map(row => row.asistencia_id)).size !== current.padron.length
    || before.padron.some(row => !current.padron.some(item => item.asistencia_id === row.asistencia_id
      && item.matricula_id === row.matricula_id && item.matricula_seccion_id === row.matricula_seccion_id))) {
    throw new Error('La respuesta no corresponde a la sesión y su padrón.');
  }
}

export function reconcileAttendance(before: AttendanceDetail, changes: AttendanceChanges, current: AttendanceDetail) {
  assertAttendanceResponse(before, current);
  const remaining: Record<string, AttendanceDetail['padron'][number]['estado']> = {}, conflicts: string[] = [], updated: string[] = [];
  const previous = new Map(before.padron.map(row => [row.asistencia_id, row]));
  for (const row of current.padron) {
    const desired = changes[row.asistencia_id], original = previous.get(row.asistencia_id)!;
    if (row.version !== original.version || row.estado !== original.estado) updated.push(row.asistencia_id);
    if (desired === undefined || desired === row.estado) continue;
    remaining[row.asistencia_id] = desired;
    if (row.version !== original.version || row.estado !== original.estado || current.sesion.estado === 'CERRADA') {
      conflicts.push(row.asistencia_id);
    }
  }
  return { base: current, changes: remaining, conflicts, updated };
}
