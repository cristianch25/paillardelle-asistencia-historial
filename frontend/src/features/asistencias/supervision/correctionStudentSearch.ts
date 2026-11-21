import type { AttendanceEntry } from '../asistencias.types';

export function correctionStudentName(row: AttendanceEntry): string {
  return [row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ');
}

export function hasStudentNamesake(row: AttendanceEntry, padron: AttendanceEntry[]): boolean {
  const nameKey = (entry: AttendanceEntry) => correctionStudentName(entry).normalize('NFC')
    .replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
  const name = nameKey(row);
  return padron.some(other => other.estudiante.id !== row.estudiante.id && nameKey(other) === name);
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function searchCorrectionStudents(rows: AttendanceEntry[], query: string): AttendanceEntry[] {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    const text = normalized(`${correctionStudentName(row)} ${row.estudiante.codigo_estudiante ?? ''}`);
    return terms.every(term => text.includes(term));
  });
}
