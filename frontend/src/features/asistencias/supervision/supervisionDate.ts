import { formatCivilDate, validCivilDate } from '../../../shared/dates/civilDate';
import type { SchoolYear } from '../../organizacion-escolar/anios-escolares/aniosEscolares.types';

export function supervisionDateError(fecha: string, year?: SchoolYear): string {
  if (!fecha) return 'Selecciona una fecha válida para consultar la supervisión.';
  if (!validCivilDate(fecha)) return 'Introduce una fecha válida del calendario.';
  if (year && (fecha < year.fecha_inicio || fecha > year.fecha_fin)) {
    return `La fecha debe estar entre el ${formatCivilDate(year.fecha_inicio)} y el ${formatCivilDate(year.fecha_fin)} del año escolar seleccionado.`;
  }
  return '';
}
