export type AttendanceChangeType =
  | 'PRIMERA_MARCA'
  | 'CAMBIO'
  | 'JUSTIFICACION'
  | 'ANULACION'
  | 'REACTIVACION';

export type AttendanceHistoryItem = {
  id: string;
  tipo: AttendanceChangeType;
  estado_anterior: string;
  estado_nuevo: string;
  justificada_anterior: boolean;
  justificada_nueva: boolean;
  motivo: string | null;
  motivo_justificacion_anterior: string | null;
  motivo_justificacion_nuevo: string | null;
  version_anterior: number;
  version_nueva: number;
  posterior_cierre: boolean;
  fecha_modificacion: string;
  modificado_por: {
    id: string;
    usuario: string;
    nombres: string;
    apellidos: string;
    rol: string;
  };
};

export type AttendanceHistoryResponse = {
  asistencia_id: string;
  sesion_id: string;
  fecha: string;
  estado_actual: string;
  justificada_actual: boolean;
  motivo_justificacion_actual: string | null;
  version_actual: number;
  estudiante: {
    id: string;
    codigo_estudiante: string | null;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombres: string;
  };
  seccion: {
    id: string;
    nivel: string;
    grado: number;
    letra: string;
    turno: string;
  };
  cambios: AttendanceHistoryItem[];
};
