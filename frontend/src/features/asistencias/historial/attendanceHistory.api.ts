import { httpClient } from '../../../shared/api/httpClient';
import type { AttendanceHistoryResponse } from './attendanceHistory.types';

export async function getAttendanceHistory(asistenciaId: string): Promise<AttendanceHistoryResponse> {
  const { data } = await httpClient.get<AttendanceHistoryResponse>(`/asistencias/${asistenciaId}/historial`);
  return data;
}
