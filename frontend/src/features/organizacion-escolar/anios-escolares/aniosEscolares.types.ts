import type { Pagination } from '../../../shared/types/pagination';

export type SchoolYear = {
  id: string;
  anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'PLANIFICADO' | 'ABIERTO' | 'CERRADO';
  created_at: string;
  updated_at: string;
};
export type SchoolYearsResponse = { anios_escolares: SchoolYear[]; pagination: Pagination };
export type SchoolYearInput = Pick<SchoolYear, 'anio' | 'fecha_inicio' | 'fecha_fin'>;
