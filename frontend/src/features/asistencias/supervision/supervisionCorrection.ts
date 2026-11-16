import type { AttendanceDetail, AttendanceState } from '../asistencias.types';
import { assertAttendanceResponse } from '../attendanceReconciliation';
import { saveAttendance } from '../asistencias.api';

export const correctionStates = [
  ['PRESENTE', 'Presente'], ['TARDANZA', 'Tardanza'], ['FALTA', 'Falta'], ['PENDIENTE', 'Sin marcar'],
] as const;
export const correctionLabel = (state: AttendanceState) => correctionStates.find(([value]) => value === state)?.[1];

export function correctionRequest(base: AttendanceDetail, id: string, state: string, reason: string) {
  const row = base.padron.find(item => item.asistencia_id === id);
  if (!row || row.version < 0) throw new Error('Selecciona una asistencia existente.');
  if (!correctionStates.some(([value]) => value === state) || row.estado === state) {
    throw new Error('Selecciona un nuevo estado válido y diferente del actual.');
  }
  if (base.sesion.estado === 'CERRADA' && (!reason.trim() || /[\uD800-\uDFFF]/u.test(reason) || [...reason].length > 500)) {
    throw new Error('Indica un motivo de corrección de hasta 500 caracteres.');
  }
  return { version: base.sesion.version, cambios: [{ asistencia_id: id, version: row.version,
    estado: state as AttendanceState, ...(base.sesion.estado === 'CERRADA' ? { motivo: reason.trim() } : {}) }] };
}

export function assertCorrectionDetail(before: AttendanceDetail, current: AttendanceDetail) {
  assertAttendanceResponse(before, current);
  const counts = { total: current.padron.length, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 0 };
  const keys = { PRESENTE: 'presentes', TARDANZA: 'tardanzas', FALTA: 'faltas', PENDIENTE: 'pendientes' } as const;
  if (!Number.isInteger(current.sesion.version) || current.sesion.version < before.sesion.version
    || !['ABIERTA', 'CERRADA'].includes(current.sesion.estado)
    || (before.sesion.estado === 'CERRADA' && current.sesion.estado !== 'CERRADA')) throw new Error('Sesión incompatible.');
  for (const row of current.padron) {
    const previous = before.padron.find(item => item.asistencia_id === row.asistencia_id)!;
    if (!Object.hasOwn(keys, row.estado) || !Number.isInteger(row.version) || row.version < previous.version) {
      throw new Error('Registro incompatible.');
    }
    counts[keys[row.estado]]++;
  }
  if (Object.entries(counts).some(([key, value]) => current.resumen[key as keyof typeof counts] !== value)) {
    throw new Error('Resumen incompatible.');
  }
}

export async function saveSupervisionCorrection(base: AttendanceDetail, id: string, state: string, reason: string) {
  const body = correctionRequest(base, id, state, reason);
  const current = await saveAttendance(base.sesion.id, body);
  assertCorrectionDetail(base, current);
  const row = current.padron.find(item => item.asistencia_id === id)!;
  if (current.sesion.version !== base.sesion.version + 1 || current.sesion.estado !== base.sesion.estado
    || row.version !== body.cambios[0]!.version + 1 || row.estado !== state) throw new Error('Corrección no confirmada.');
  return current;
}
