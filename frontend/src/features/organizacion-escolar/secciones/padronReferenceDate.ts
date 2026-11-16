import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';
import { peruToday, validCivilDate } from '../../../shared/dates/civilDate';

export function padronReferenceDate(year: SchoolYear, today = peruToday()): string {
  if (!validCivilDate(year.fecha_inicio) || !validCivilDate(year.fecha_fin)
    || year.fecha_inicio > year.fecha_fin || !validCivilDate(today)) return '';
  return today < year.fecha_inicio ? year.fecha_inicio : today > year.fecha_fin ? year.fecha_fin : today;
}
