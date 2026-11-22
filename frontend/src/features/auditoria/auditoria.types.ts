import type { Pagination } from '../../shared/types/pagination';
import type { AttendanceState } from '../asistencias/asistencias.types';
import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';

export type AuditUser = {
  id: string;
  nombre_completo: string;
  usuario: string;
  rol: string;
};

export type AuditRecord = {
  id: string;
  fecha_hora: string;
  usuario: AuditUser;
  accion: string;
  accion_nombre: string;
  entidad: string;
  registro_id: string | null;
  descripcion: string;
  origen?: 'administrativa' | 'asistencia';
  asistencia?: {
    tipo: string; fecha: string;
    estudiante: { id: string; nombre_completo: string };
    seccion: { id: string; nivel: EducationLevel; grado: number; letra: string };
    estado_anterior: AttendanceState; estado_nuevo: AttendanceState;
    justificada_anterior: boolean; justificada_nueva: boolean;
    motivo_justificacion_anterior: string | null; motivo_justificacion_nuevo: string | null; motivo: string | null;
  };
};

export type AuditResponse = {
  registros: AuditRecord[];
  pagination: Pagination;
};

export type AuditQuery = {
  page?: number;
  limit?: number;
  categoria?: string;
};
