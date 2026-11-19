import type { AttendanceDetail } from './asistencias.types';
import type { AttendanceChanges } from './attendanceDraft';

export function alignAttendancePreview(before: AttendanceDetail, current: AttendanceDetail,
  changes: AttendanceChanges = {}, reasons: Record<string, string> = {}) {
  if (before.sesion.id) return { before, changes, reasons };
  if (['anio_escolar_id', 'seccion_id', 'fecha'].some(key => before.sesion[key as keyof typeof before.sesion]
    !== current.sesion[key as keyof typeof current.sesion])) throw new Error('La respuesta no corresponde a la fecha y sección.');
  const byEnrollment = new Map(current.padron.map(row => [row.matricula_id, row]));
  const mappedChanges: Record<string, AttendanceDetail['padron'][number]['estado']> = {}, mappedReasons: Record<string, string> = {};
  const padron = before.padron.map(row => {
    const actual = byEnrollment.get(row.matricula_id);
    if (!actual || actual.matricula_seccion_id !== row.matricula_seccion_id) throw new Error('El padrón cambió. Vuelve a consultar antes de guardar.');
    if (changes[row.asistencia_id] !== undefined) mappedChanges[actual.asistencia_id] = changes[row.asistencia_id]!;
    if (reasons[row.asistencia_id] !== undefined) mappedReasons[actual.asistencia_id] = reasons[row.asistencia_id]!;
    return { ...row, asistencia_id: actual.asistencia_id };
  });
  return { before: { ...before, sesion: current.sesion, padron }, changes: mappedChanges, reasons: mappedReasons };
}
