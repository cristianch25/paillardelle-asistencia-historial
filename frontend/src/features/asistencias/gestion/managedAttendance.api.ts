import { getAttendance } from '../asistencias.api';
import { getAttendanceSupervision } from '../supervision/supervision.api';
import type { SupervisionFilters } from '../supervision/supervision.types';
import type { SupervisionDetail } from '../supervision/supervisionDetail.api';

export async function getManagedAttendance(filters: SupervisionFilters, isCurrent: () => boolean): Promise<{ detail: SupervisionDetail | null } | null> {
  if (!isCurrent()) return null;
  const { anio_escolar_id, fecha, seccion_id, nivel } = filters;
  const data = await getAttendanceSupervision({ anio_escolar_id, fecha, seccion_id, ...(nivel ? { nivel } : {}), page: 1, limit: 1 });
  if (!isCurrent()) return null;
  const row = data.secciones[0];
  if (data.anio_escolar_id !== anio_escolar_id || data.fecha !== fecha || data.secciones.length !== 1
    || !row || row.seccion.id !== seccion_id || row.seccion.anio_escolar_id !== anio_escolar_id
    || (nivel && row.seccion.nivel !== nivel)) throw new Error('Sección de asistencia incompatible.');
  if (row.situacion === 'SIN_REGISTRO' && row.sesion_id === null) return { detail: null };
  if (!row.sesion_id) throw new Error('Sesión de asistencia incompatible.');
  const attendance = await getAttendance(row.sesion_id);
  if (!isCurrent()) return null;
  const session = attendance.sesion;
  if (session.id !== row.sesion_id || session.seccion_id !== seccion_id || session.anio_escolar_id !== anio_escolar_id
    || session.fecha !== fecha) throw new Error('Detalle de asistencia incompatible.');
  return { detail: { attendance, section: row.seccion } };
}
