import type { AttendanceEntry, AttendanceState } from '../asistencias.types';
import type { Section } from '../../organizacion-escolar/secciones/secciones.types';
import type { Pagination } from '../../../shared/types/pagination';

export type StudentSearchRow = {
  estudiante: AttendanceEntry['estudiante'];
  matricula_id: string;
  matricula_seccion_id: string;
  anio_escolar: { id: string; anio: number };
  seccion: Pick<Section, 'id' | 'nivel' | 'grado' | 'letra' | 'turno'>;
  fecha: string;
  situacion: 'CON_REGISTRO' | 'SIN_ASISTENCIA' | 'SIN_SESION';
  estado: AttendanceState | null;
  justificada: boolean;
  motivo_justificacion: string | null;
  sesion_id: string | null;
  sesion_estado: 'ABIERTA' | 'CERRADA' | null;
  sesion_version: number | null;
  asistencia_id: string | null;
  asistencia_version: number | null;
};
export type StudentSearchResponse = { fecha: string; q: string; resultados: StudentSearchRow[]; pagination: Pagination };
export const searchRowKey = (row: StudentSearchRow) => JSON.stringify([row.matricula_id, row.matricula_seccion_id]);
