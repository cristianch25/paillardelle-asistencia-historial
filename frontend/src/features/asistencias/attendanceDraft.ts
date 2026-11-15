import type { AttendanceDetail, AttendanceEntry, AttendanceState } from './asistencias.types';

export type AttendanceChanges = Readonly<Record<string, AttendanceState>>;

export function attendanceDraftKey(accountId: string | null, data: AttendanceDetail | null) {
  if (!accountId || !data) return null;
  const { anio_escolar_id, seccion_id, fecha, id } = data.sesion;
  return JSON.stringify([accountId, anio_escolar_id, seccion_id, fecha, id]);
}

export function selectAttendanceState(rows: AttendanceEntry[], changes: AttendanceChanges,
  id: string, state: AttendanceState): AttendanceChanges {
  const row = rows.find(entry => entry.asistencia_id === id);
  if (!row) return changes;
  const next = { ...changes };
  if (state === row.estado) delete next[id];
  else next[id] = state;
  return next;
}

export function markPendingPresent(rows: AttendanceEntry[], changes: AttendanceChanges): AttendanceChanges {
  const next = { ...changes };
  for (const row of rows) {
    if ((changes[row.asistencia_id] ?? row.estado) !== 'PENDIENTE') continue;
    if (row.estado === 'PRESENTE') delete next[row.asistencia_id];
    else next[row.asistencia_id] = 'PRESENTE';
  }
  return next;
}

export function draftSummary(rows: AttendanceEntry[], changes: AttendanceChanges): AttendanceDetail['resumen'] {
  const counts = { PENDIENTE: 0, PRESENTE: 0, TARDANZA: 0, FALTA: 0 };
  for (const row of rows) counts[changes[row.asistencia_id] ?? row.estado]++;
  return { total: rows.length, presentes: counts.PRESENTE, tardanzas: counts.TARDANZA,
    faltas: counts.FALTA, pendientes: counts.PENDIENTE };
}
