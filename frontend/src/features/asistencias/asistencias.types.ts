export type AttendanceState = 'PENDIENTE' | 'PRESENTE' | 'TARDANZA' | 'FALTA';
export type AttendanceSession = {
  id: string;
  anio_escolar_id: string;
  seccion_id: string;
  fecha: string;
  estado: 'ABIERTA' | 'CERRADA';
  version: number;
  abierta_por: string;
  abierta_en: string;
  cerrada_por: string | null;
  cerrada_en: string | null;
};
export type AttendanceEntry = {
  asistencia_id: string;
  matricula_id: string;
  matricula_seccion_id: string;
  estado: AttendanceState;
  version: number;
  justificada: boolean;
  motivo_justificacion: string | null;
  estudiante: {
    id: string;
    codigo_estudiante: string | null;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombres: string;
  };
  ultimo_cambio: { usuario_id: string; fecha: string } | null;
};
export type AttendanceDetail = {
  sesion: AttendanceSession;
  padron: AttendanceEntry[];
  resumen: { total: number; presentes: number; tardanzas: number; faltas: number; pendientes: number };
};
export type AttendanceOpening = AttendanceDetail & { creada: boolean };
export type AttendanceClosing = AttendanceDetail & {
  advertencias: { codigo: 'PENDIENTES_AL_CERRAR'; cantidad: number }[];
};
export type AttendancePatch = {
  version: number;
  cambios: { asistencia_id: string; version: number; estado: AttendanceState;
    justificada?: boolean; motivo_justificacion?: string | null; motivo?: string }[];
};
