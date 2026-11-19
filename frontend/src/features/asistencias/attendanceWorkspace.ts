import { getAttendance } from './asistencias.api';
import { getAttendanceSupervision } from './supervision/supervision.api';
import { getPadron } from '../organizacion-escolar/secciones/padron.api';
import type { AttendanceOpening } from './asistencias.types';

// Consulta sin escrituras. Los identificadores preview nunca se envían al PATCH.
export async function getAttendanceWorkspace(yearId: string, sectionId: string, fecha: string): Promise<AttendanceOpening> {
  const listing = await getAttendanceSupervision({ anio_escolar_id: yearId, seccion_id: sectionId, fecha, page: 1, limit: 100 });
  const item = listing.secciones.find(row => row.seccion.id === sectionId);
  if (!item || listing.fecha !== fecha || listing.anio_escolar_id !== yearId) throw new Error('La sección no está disponible en esta fecha.');
  if (item.sesion_id) {
    const data = await getAttendance(item.sesion_id);
    if (data.sesion.id !== item.sesion_id || data.sesion.anio_escolar_id !== yearId
      || data.sesion.seccion_id !== sectionId || data.sesion.fecha !== fecha) throw new Error('Respuesta de otra sesión.');
    return { ...data, creada: false };
  }
  const roster = await getPadron(sectionId, fecha);
  if (roster.fecha !== fecha || roster.seccion.id !== sectionId
    || new Set(roster.padron.map(row => row.id)).size !== roster.padron.length) throw new Error('Padrón incompatible.');
  return { creada: false, sesion: { id: '', anio_escolar_id: yearId, seccion_id: sectionId, fecha,
    estado: 'ABIERTA', version: 0, abierta_por: '', abierta_en: '', cerrada_por: null, cerrada_en: null },
  padron: roster.padron.map(row => ({ asistencia_id: `preview:${row.id}`, matricula_id: row.id,
    matricula_seccion_id: row.matricula_seccion_id, estado: 'PENDIENTE', version: 0,
    justificada: false, motivo_justificacion: null, estudiante: row.estudiante, ultimo_cambio: null })),
  resumen: { total: roster.padron.length, pendientes: roster.padron.length, presentes: 0, tardanzas: 0, faltas: 0 } };
}
