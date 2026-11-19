import { httpClient } from '../../../shared/api/httpClient';
import type { EducationLevel } from '../secciones/secciones.types';
import axios from 'axios';
import { apiErrorMessage } from '../../../shared/api/apiError';

export type CalendarDay = {
  fecha: string;
  es_lectivo: boolean;
  origen: 'EXCEPCION' | 'REGLA_SEMANAL' | 'FUERA_DE_PERIODO';
  descripcion: string | null;
  por_nivel?: { nivel: EducationLevel; es_lectivo: boolean; descripcion: string | null }[];
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

export async function getCalendarRange(anio_escolar_id: string, nivel: EducationLevel, desde: string, hasta: string) {
  const { data } = await httpClient.get<CalendarResponse>('/calendario-lectivo', {
    params: { anio_escolar_id, nivel, desde, hasta },
  });
  if (data.anio_escolar_id !== anio_escolar_id || data.nivel !== nivel || data.desde !== desde || data.hasta !== hasta
    || !Array.isArray(data.dias) || data.dias.some(day => typeof day.es_lectivo !== 'boolean')) throw new Error('Calendario no confirmado.');
  return data;
}

export async function getCalendarLevels(anio_escolar_id: string): Promise<EducationLevel[]> {
  const levels: EducationLevel[] = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];
  const allowed = await Promise.all(levels.map(async nivel => {
    try { await httpClient.get('/periodos-lectivos', { params: { anio_escolar_id, nivel, page: 1, limit: 1 } }); return nivel; }
    catch (error) { if (axios.isAxiosError(error) && error.response?.status === 403) return null; throw error; }
  }));
  return allowed.filter((level): level is EducationLevel => level !== null);
}

export const exceptionDescription = (lective: boolean, description: string) => description.trim()
  || (lective ? 'Día lectivo / recuperación' : 'Día no lectivo');

export async function getCalendarScope(yearId: string, levels: EducationLevel[], desde: string, hasta: string) {
  const calendars = await Promise.all(levels.map(level => getCalendarRange(yearId, level, desde, hasta)));
  const first = calendars[0]!;
  if (levels.length === 1) return first;
  return { ...first, dias: first.dias.map((day, index) => {
    const entries = calendars.map((calendar, i) => {
      const entry = calendar.dias[index];
      if (entry?.fecha !== day.fecha) throw new Error('Calendarios incompatibles.');
      return { nivel: levels[i]!, es_lectivo: entry.es_lectivo, descripcion: entry.descripcion };
    });
    return { ...day, origen: calendars.some(calendar => calendar.dias[index]?.origen === 'EXCEPCION') ? 'EXCEPCION' as const : day.origen,
      es_lectivo: entries.every(entry => entry.es_lectivo), por_nivel: entries,
      descripcion: entries.every(entry => entry.descripcion === day.descripcion) ? day.descripcion : null };
  }) };
}

export async function saveCalendarException(yearId: string, level: EducationLevel, date: string, lective: boolean, description: string, levels = [level]) {
  const body = { es_lectivo: lective, descripcion: exceptionDescription(lective, description), ...(levels.length > 1 ? { niveles: levels } : {}) };
  const { data } = await httpClient.put(`/calendario-lectivo/excepciones/${yearId}/${level}/${date}`, body);
  const rows = levels.length > 1 ? data?.excepciones : [data?.excepcion];
  if (!Array.isArray(rows) || rows.length !== levels.length || new Set(rows.map(row => row?.nivel)).size !== levels.length
    || rows.some(saved => saved?.fecha !== date || !levels.includes(saved.nivel) || saved.anio_escolar_id !== yearId
      || saved.es_lectivo !== lective || saved.descripcion !== body.descripcion)) throw new Error('Guardado no confirmado.');
}

export function calendarError(error: unknown) {
  if (axios.isAxiosError(error) && [400, 409].includes(error.response?.status ?? 0)) {
    const message = error.response?.data?.error;
    if (typeof message === 'string' && message.length <= 200) return message.includes('asistencias')
      ? 'Esta fecha tiene sesiones de asistencia y debe permanecer lectiva.' : message;
  }
  return apiErrorMessage(error);
}
