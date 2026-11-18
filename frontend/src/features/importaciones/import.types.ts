import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import type { Pagination } from '../../shared/types/pagination';

export type ImportSelection = { anio_escolar_id: string; nivel: EducationLevel | ''; fecha_ingreso: string };
export type PreviewRow = {
  id: string; estudiante: { codigo_estudiante: string | null; nombres: string; apellido_paterno: string; apellido_materno: string | null };
  contexto: { nivel: string; grado_edad: string; seccion: string }; estado_original: string;
  documento_omitido?: boolean; documento_original?: { tipo: string | null; numero: string | null };
  origen: { hoja: string; fila: number }; clasificacion: string; seleccionable: boolean;
  observaciones: { campo: string; motivo: string; ambito: string; bloqueante: boolean }[]; propuestas: string[];
  contacto: { version: number; telefono_original: string | null; telefono_propuesto: string | null; candidatos: string[];
    corregido: boolean; puede_corregir: boolean; requiere_revision_identidad: boolean };
};
export type ImportPreview = {
  id: string; caduca_en: string; confirmacion_habilitada: false; seleccion: ImportSelection;
  filas_seleccionadas: string[]; resumen: Record<string, number>; registros: PreviewRow[]; pagination: Pagination;
};
