import { validCivilDate } from '../../shared/dates/civilDate';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import type { StatisticsPeriod } from './statistics.types';

const civil = (date: Date) => date.toISOString().slice(0, 10);

export function statisticsRange(period: StatisticsPeriod, reference: string, year?: SchoolYear, end = '') {
  if (!year) return { error: 'Selecciona un año escolar.' };
  if (period === 'personalizado') {
    if (!reference || !end) return { error: 'Indica la fecha de inicio y la fecha de fin.' };
    if (!validCivilDate(reference) || !validCivilDate(end)) return { error: 'Selecciona fechas válidas.' };
    if (reference > end) return { error: 'La fecha de inicio no puede ser posterior a la fecha de fin.' };
    if (reference < year.fecha_inicio || end > year.fecha_fin) return { error: 'Ambas fechas deben estar dentro del año escolar.' };
    return { fecha_desde: reference, fecha_hasta: end, error: '' };
  }
  if (!validCivilDate(reference)) return { error: 'Selecciona una fecha válida.' };
  const date = new Date(`${reference}T00:00:00Z`);
  let from = reference, to = reference;
  if (period === 'semana') {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    from = civil(date); date.setUTCDate(date.getUTCDate() + 6); to = civil(date);
  } else if (period === 'mes') {
    date.setUTCDate(1); from = civil(date);
    date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0); to = civil(date);
  }
  from = from < year.fecha_inicio ? year.fecha_inicio : from;
  to = to > year.fecha_fin ? year.fecha_fin : to;
  return from > to ? { error: 'El período está fuera del año escolar.' }
    : { fecha_desde: from, fecha_hasta: to, error: '' };
}

export function initialStatisticsDate(today: string, year?: SchoolYear) {
  if (!year) return today;
  return today < year.fecha_inicio ? year.fecha_inicio : today > year.fecha_fin ? year.fecha_fin : today;
}
