import { httpClient } from '../../shared/api/httpClient';
import type { AttendanceDetail, AttendanceOpening, AttendancePatch } from './asistencias.types';

export async function openAttendance(seccion_id: string, fecha: string): Promise<AttendanceOpening> {
  const { data } = await httpClient.post<AttendanceOpening>('/asistencias/sesiones', { seccion_id, fecha });
  return data;
}

export async function getAttendance(id: string): Promise<AttendanceDetail> {
  const { data } = await httpClient.get<AttendanceDetail>(`/asistencias/sesiones/${id}`);
  return data;
}

export async function saveAttendance(id: string, changes: AttendancePatch): Promise<AttendanceDetail> {
  const response = await httpClient.patch<AttendanceDetail>(`/asistencias/sesiones/${id}/registros`, changes);
  if (response.status !== 200) throw new Error('Confirmación de guardado inesperada.');
  return response.data;
}
