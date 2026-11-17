import type { Pagination } from '../../../shared/types/pagination';
import type { EducationLevel, Section } from '../../organizacion-escolar/secciones/secciones.types';
import type { AttendanceDetail } from '../asistencias.types';

export type SupervisionQuery = {
  anio_escolar_id: string;
  fecha: string;
  nivel?: EducationLevel;
  seccion_id?: string;
  page?: number;
  limit?: number;
};
export type SupervisionSection = {
  seccion: Section;
  es_lectivo: boolean;
  situacion: 'ABIERTA' | 'CERRADA' | 'SIN_REGISTRO';
  sesion_id: string | null;
  resumen: AttendanceDetail['resumen'] | null;
};
export type SupervisionResponse = {
  anio_escolar_id: string;
  fecha: string;
  secciones: SupervisionSection[];
  pagination: Pagination;
};
export type SupervisionFilters = {
  anio_escolar_id: string;
  fecha: string;
  nivel: EducationLevel | '';
  seccion_id: string;
  page: number;
};
