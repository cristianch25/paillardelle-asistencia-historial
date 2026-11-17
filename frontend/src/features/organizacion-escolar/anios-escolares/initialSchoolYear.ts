import { peruToday } from '../../../shared/dates/civilDate';
import type { SchoolYear } from './aniosEscolares.types';

// Recibe únicamente las opciones válidas para la pantalla, sin ampliar permisos.
export function initialSchoolYear(years: readonly SchoolYear[], now = new Date()): string {
  const currentYear = Number(peruToday(now).slice(0, 4));
  const valid = years.filter(year => /^[1-9]\d*$/.test(year.id) && Number.isInteger(year.anio));
  const current = valid.filter(year => year.anio === currentYear);
  const candidates = current.length ? current : valid.filter(year => year.estado === 'ABIERTO');
  return [...candidates].sort((left, right) => right.anio - left.anio
    || (BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0))[0]?.id ?? '';
}
