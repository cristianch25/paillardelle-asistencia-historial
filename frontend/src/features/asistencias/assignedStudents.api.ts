import { getSupervisionSections } from './supervision/supervision.api';
import { getAttendanceWorkspace } from './attendanceWorkspace';
import { searchCorrectionStudents } from './supervision/correctionStudentSearch';
import type { AttendanceEntry } from './asistencias.types';
import type { SectionSelection } from '../organizacion-escolar/secciones/secciones.types';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';

export type AssignedStudent = { row: AttendanceEntry; selection: SectionSelection };
export async function loadAssignedStudents(years: SchoolYear[], date: string, current: () => boolean) {
  const students: AssignedStudent[] = [];
  for (const year of years.filter(item => date >= item.fecha_inicio && date <= item.fecha_fin)) {
    const sections = await getSupervisionSections({ anio_escolar_id: year.id, fecha: date }, current);
    if (!sections || !current()) return null;
    for (const section of sections) {
      if (!current()) return null;
      const data = await getAttendanceWorkspace(year.id, section.id, date);
      if (!current()) return null;
      students.push(...data.padron.map(row => ({ row, selection: { section, year } })));
    }
  }
  return students;
}

export function filterAssignedStudents(students: AssignedStudent[], query: string) {
  if (!query.trim()) return [];
  return students.filter(({ row }) => searchCorrectionStudents([row], query).length > 0);
}
