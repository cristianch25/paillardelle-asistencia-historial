import { httpClient } from '../../shared/api/httpClient';
import type { AttendanceOpening } from './asistencias.types';

export async function openAttendance(seccion_id: string, fecha: string): Promise<AttendanceOpening> {
  const { data } = await httpClient.post<AttendanceOpening>('/asistencias/sesiones', { seccion_id, fecha });
  return data;
}
