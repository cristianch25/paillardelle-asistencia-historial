import { peruToday } from '../../../shared/dates/civilDate';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';

export function monthRange(month: string, year: SchoolYear) {
  const [yyyy, mm] = month.split('-').map(Number);
  const last = new Date(Date.UTC(yyyy!, mm!, 0)).getUTCDate();
  const firstDate = `${month}-01`, lastDate = `${month}-${last}`;
  return { desde: firstDate < year.fecha_inicio ? year.fecha_inicio : firstDate,
    hasta: lastDate > year.fecha_fin ? year.fecha_fin : lastDate };
}
export function initialMonth(year: SchoolYear) {
  const month = peruToday().slice(0, 7);
  return month < year.fecha_inicio.slice(0, 7) || month > year.fecha_fin.slice(0, 7) ? year.fecha_inicio.slice(0, 7) : month;
}
export function moveMonth(month: string, step: number) {
  return new Date(`${month}-01T00:00:00Z`).setUTCMonth(Number(month.slice(5)) - 1 + step);
}
export function shiftedMonth(month: string, step: number) { return new Date(moveMonth(month, step)).toISOString().slice(0, 7); }
export const monthTitle = (month: string) => new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${month}-01T00:00:00Z`)).replace(/^./, first => first.toLocaleUpperCase('es-PE'));

// Solo coloca fechas en una cuadrícula; la lectividad siempre procede de la API.
export function monthCells(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`), offset = (date.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + last) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > last ? null : `${month}-${String(day).padStart(2, '0')}`;
  });
}
