import type { Pagination } from '../../../shared/types/pagination';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';

export type EducationLevel = 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA';
export type Section = {
  id: string;
  anio_escolar_id: string;
  nivel: EducationLevel;
  grado: number;
  letra: string;
  turno: string | null;
  activo: boolean;
};
export type SectionFilters = { nivel: EducationLevel | ''; grado: string; activo: '' | 'true' | 'false' };
export type SectionsQuery = {
  anio_escolar_id?: string;
  page: number;
  limit: number;
  nivel?: EducationLevel;
  grado?: string;
  activo?: 'true' | 'false';
};
export type SectionsResponse = { secciones: Section[]; pagination: Pagination };
export type SectionSelection = { section: Section; year: SchoolYear };
export type SectionInput = Pick<Section, 'anio_escolar_id' | 'nivel' | 'grado' | 'letra'>;
export type SectionBatchInput = Omit<SectionInput, 'letra'> & { letra_desde: string; letra_hasta: string };
export type SectionPatch = {
  esperado: Pick<Section, 'grado' | 'letra' | 'activo'>;
  cambios: Partial<Pick<Section, 'grado' | 'letra' | 'activo'>>;
};
