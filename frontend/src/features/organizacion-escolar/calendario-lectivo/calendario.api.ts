import { httpClient } from '../../../shared/api/httpClient';
import type { EducationLevel } from '../secciones/secciones.types';

export type CalendarDay = {
  fecha: string;
  es_lectivo: boolean;
  origen: 'EXCEPCION' | 'REGLA_SEMANAL' | 'FUERA_DE_PERIODO';
  descripcion: string | null;
};
export type CalendarResponse = {
  anio_escolar_id: string; nivel: EducationLevel; desde: string; hasta: string; dias: CalendarDay[];
};

export async function getCalendarDay(anio_escolar_id: string, nivel: EducationLevel, fecha: string) {
  const { data } = await httpClient.get<CalendarResponse>('/calendario-lectivo', {
    params: { anio_escolar_id, nivel, desde: fecha, hasta: fecha },
  });
  return data;
}
