import type { AuthUser } from '../../auth/auth.types';
import type { EducationLevel } from '../secciones/secciones.types';
import { educationLevelLabels } from '../secciones/sectionPresentation';
import type { CalendarDay } from './calendario.api';

export type CalendarScope = { key: string; label: string; levels: EducationLevel[] };
export function calendarScopes(user: AuthUser, allowed: EducationLevel[]): CalendarScope[] {
  if (!allowed.length) return [];
  if (user.rol === 'ADMIN' && !(['INICIAL', 'PRIMARIA', 'SECUNDARIA'] as const).every(level => allowed.includes(level))) return [];
  if (user.rol === 'ADMIN') return [{ key: 'TODOS', label: 'Todos los niveles', levels: allowed },
    ...allowed.map(level => ({ key: level, label: educationLevelLabels[level], levels: [level] }))];
  const grouped = user.nivel_asignado === 'PRIMARIA' && allowed.includes('INICIAL') && allowed.includes('PRIMARIA');
  if (grouped) return [{ key: 'INICIAL_PRIMARIA', label: 'Inicial y Primaria', levels: ['INICIAL', 'PRIMARIA'] },
    ...allowed.filter(level => level !== 'INICIAL' && level !== 'PRIMARIA')
      .map(level => ({ key: level, label: educationLevelLabels[level], levels: [level] }))];
  const ordered = [...allowed].sort((a, b) => Number(b === user.nivel_asignado) - Number(a === user.nivel_asignado));
  return ordered.map(level => ({ key: level, label: educationLevelLabels[level], levels: [level] }));
}
export function mixedCalendarDay(day: CalendarDay) {
  return Boolean(day.por_nivel?.some(entry => entry.es_lectivo !== day.es_lectivo));
}
