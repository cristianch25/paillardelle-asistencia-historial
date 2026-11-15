import { getAttendance } from '../asistencias.api';
import { getAttendanceSupervision } from './supervision.api';
import type { AttendanceDetail } from '../asistencias.types';
import type { Section } from '../../organizacion-escolar/secciones/secciones.types';

export type SupervisionDetail = { attendance: AttendanceDetail; section: Section };

export async function getSupervisionDetail(id: string, isCurrent: () => boolean): Promise<SupervisionDetail | null> {
  if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 18446744073709551615n) throw new Error('Identificador de sesión inválido.');
  if (!isCurrent()) return null;
  const attendance = await getAttendance(id);
  if (!isCurrent()) return null;
  if (attendance.sesion.id !== id) throw new Error('Sesión inesperada.');
  const { sesion } = attendance;
  // El detalle no incluye la identidad académica: resolverla dentro del mismo ámbito de asistencia.
  const data = await getAttendanceSupervision({ anio_escolar_id: sesion.anio_escolar_id,
    fecha: sesion.fecha, seccion_id: sesion.seccion_id, page: 1, limit: 1 });
  if (!isCurrent()) return null;
  const row = data.secciones[0];
  if (!row || data.anio_escolar_id !== sesion.anio_escolar_id || data.fecha !== sesion.fecha || data.secciones.length !== 1
    || row.seccion.id !== sesion.seccion_id || row.sesion_id !== id) throw new Error('Sección de sesión no disponible.');
  return { attendance, section: row.seccion };
}
