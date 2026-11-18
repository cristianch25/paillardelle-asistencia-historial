import { httpClient } from '../../../shared/api/httpClient';
import type { StudentProfile } from './profile.types';
import { validCivilDate } from '../../../shared/dates/civilDate';
export async function getStudentProfile(id: string, year: string, month: string, signal?: AbortSignal) {
  if (!/^[1-9]\d*$/.test(id) || !/^[1-9]\d*$/.test(year) || !/^[1-9]\d{3}-\d{2}$/.test(month)
    || !validCivilDate(`${month}-01`)) throw new Error('Filtros de perfil inválidos.');
  const { data } = await httpClient.get<StudentProfile>(`/estudiantes/${id}/perfil`, { params: { anio_escolar_id: year, mes: month }, signal });
  if (data.estudiante?.id !== id || data.contexto?.anio_escolar_id !== year || data.contexto.mes !== month
    || !Array.isArray(data.dias) || data.dias.length > 31 || new Set(data.dias.map(day => day.fecha)).size !== data.dias.length
    || data.dias.some(day => day.fecha.slice(0, 7) !== month || (day.situacion === 'CON_REGISTRO'
      ? !['PRESENTE', 'TARDANZA', 'FALTA', 'PENDIENTE'].includes(day.estado ?? '') : day.estado !== null))
    || (!data.apoderado_visible && data.apoderado !== null)) throw new Error('Respuesta de perfil inconsistente.');
  const counts = data.resumen;
  if (!counts || Object.values(counts).some(value => !Number.isSafeInteger(value) || value < 0)
    || counts.total !== counts.presentes + counts.tardanzas + counts.faltas + counts.pendientes
    || counts.total !== data.dias.filter(day => day.situacion === 'CON_REGISTRO').length) throw new Error('Resumen de perfil inconsistente.');
  for (const [state, key] of [['PRESENTE', 'presentes'], ['TARDANZA', 'tardanzas'], ['FALTA', 'faltas'], ['PENDIENTE', 'pendientes']] as const) {
    if (counts[key] !== data.dias.filter(day => day.estado === state).length) throw new Error('Conteos de perfil inconsistentes.');
  }
  return data;
}
