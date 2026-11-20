import type { EducationLevel } from '../../organizacion-escolar/secciones/secciones.types';
import type { AttendanceState } from '../../asistencias/asistencias.types';
export type ProfileSelection = { studentId: string; yearId?: string; month?: string };
export type ProfileSection = { id: string; nivel: EducationLevel; grado: number; letra: string };
export type StudentProfile = {
  estudiante: { id: string; nombres: string; apellido_paterno: string; apellido_materno: string | null; codigo_estudiante: string | null };
  contexto: { anio_escolar_id: string; mes: string; fecha_desde: string; fecha_hasta: string;
    matricula_id?: string | null; matricula_estado?: string | null; fecha_retiro?: string | null;
    seccion_actual: ProfileSection | null; secciones: (ProfileSection & { fecha_inicio: string; fecha_fin: string | null })[] };
  apoderado_visible: boolean;
  apoderado: { nombres_apellidos: string; telefono: string | null } | null;
  resumen: { total: number; presentes: number; tardanzas: number; faltas: number; pendientes: number;
    justificadas: number; injustificadas: number; faltas_justificadas: number; tardanzas_justificadas: number };
  dias: { fecha: string; seccion: ProfileSection | null; es_lectivo: boolean | null;
    situacion: 'CON_REGISTRO' | 'FUERA_DE_VIGENCIA' | 'SIN_ASISTENCIA' | 'SIN_SESION';
    estado: AttendanceState | null; justificada: boolean; motivo_justificacion: string | null }[];
};
