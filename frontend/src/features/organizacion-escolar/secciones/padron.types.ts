import type { Section } from './secciones.types';

export type PadronStudent = {
  id: string;
  codigo_estudiante: string | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  apellido_paterno: string;
  apellido_materno: string | null;
  nombres: string;
  fecha_nacimiento: string | null;
  created_at: string;
  updated_at: string;
};

export type PadronEntry = {
  id: string;
  estudiante_id: string;
  anio_escolar_id: string;
  fecha_ingreso: string;
  fecha_retiro: string | null;
  estado: 'ACTIVA' | 'RETIRADA' | 'FINALIZADA';
  matricula_seccion_id: string;
  seccion_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estudiante: PadronStudent;
};

export type PadronResponse = { seccion: Section; fecha: string; padron: PadronEntry[] };
