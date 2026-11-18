import type { EducationLevel, Section } from '../organizacion-escolar/secciones/secciones.types';
import type { Pagination } from '../../shared/types/pagination';

export type MonthlyFollowupQuery = { anio_escolar_id: string; mes: string; nivel?: EducationLevel; page: number; limit: number };
export type MonthlyFollowupStudent = {
  estudiante: { id: string; apellido_paterno: string; apellido_materno: string | null; nombres: string };
  secciones: Pick<Section, 'id' | 'nivel' | 'grado' | 'letra'>[];
  faltas: number; tardanzas: number; total: number; justificadas: number; injustificadas: number;
};
export type MonthlyFollowupResponse = {
  filtros: { anio_escolar_id: string; mes: string; nivel: EducationLevel | null; fecha_desde: string; fecha_hasta: string };
  niveles_autorizados: EducationLevel[];
  estudiantes: MonthlyFollowupStudent[];
  pagination: Pagination & { total: number };
};
