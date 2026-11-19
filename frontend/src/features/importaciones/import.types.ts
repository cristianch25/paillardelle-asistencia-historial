import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import type { Pagination } from '../../shared/types/pagination';

export type ImportSelection = { anio_escolar_id: string; nivel: EducationLevel | ''; fecha_ingreso: string };
export type PreviewRow = {
  apoderado?: { nombres_apellidos: string | null; tipo_documento: string | null; numero_documento: string | null; parentesco: string | null };
  id: string; estudiante: { codigo_estudiante: string | null; nombres: string; apellido_paterno: string; apellido_materno: string | null };
  contexto: { nivel: string; grado_edad: string; seccion: string }; estado_original: string;
  documento_omitido?: boolean; documento_original?: { tipo: string | null; numero: string | null };
  origen: { hoja: string; fila: number }; clasificacion: string; seleccionable: boolean; ya_matriculado?: boolean;
  observaciones: { campo: string; motivo: string; ambito: string; bloqueante: boolean }[]; propuestas: string[];
  contacto: { version: number; telefono_original: string | null; telefono_propuesto: string | null; candidatos: string[];
    corregido: boolean; puede_corregir: boolean; requiere_revision_identidad: boolean };
};
export type ImportPreview = {
  id: string; caduca_en: string; confirmacion_habilitada: boolean; seleccion: ImportSelection;
  version_plan?: string;
  resumen_confirmacion?: Record<string, number>;
  decisiones_telefono?: { id_propuesta: string; telefono_actual: string | null; telefono_propuesto: string; apoderado?: string | null;
    afecta_otros_vinculos: boolean }[];
  filas_seleccionadas: string[]; resumen: Record<string, number>; registros: PreviewRow[]; pagination: Pagination;
};
export type PhoneDecision = { id_propuesta: string; decision: 'ACTUALIZAR' | 'CONSERVAR' };
export type ImportConfirmationInput = { aceptar: true; version_plan: string; filas: string[];
  clave_operacion: string; decisiones_telefono: PhoneDecision[] };
export type ImportReceipt = { estado: 'CONFIRMADA'; confirmacion_id: string; repetida: boolean;
  cantidades: Record<string, number>; filas: { fila: string; estudiante_id: string; matricula_id: string | null; contacto_pendiente: boolean }[] };
export type ImportOperationStatus = ImportReceipt | { estado: 'SIN_CONFIRMACION_VERIFICADA' };
