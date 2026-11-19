import type { ImportSelection, PreviewRow } from './import.types';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { validCivilDate } from '../../shared/dates/civilDate';
import axios from 'axios';
import { apiErrorMessage } from '../../shared/api/apiError';
import { academicConflict } from './previewReview';

export function importErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status, message = error.response?.data?.error;
    if ([400, 404, 408, 409, 413, 429].includes(status ?? 0) && typeof message === 'string' && message.length <= 200) return message;
    if (status === 503) return 'Hay dos análisis en curso. Intenta nuevamente en un momento.';
  }
  return apiErrorMessage(error);
}

export const classificationLabels: Record<string, string> = {
  NUEVO: 'Nuevo', EXISTENTE: 'Ya registrado', EXISTENTE_CON_PROPUESTA: 'Ya registrado',
  OBSERVADO: 'Observado', CONFLICTIVO: 'Conflicto', REQUIERE_ADMIN: 'Requiere ADMIN',
};
const reasons: Record<string, string> = {
  ESTADO_ORIGEN_NO_ADMITIDO: 'Estado del padrón pendiente de equivalencia validada.',
  IDENTIFICACION_INSUFICIENTE: 'Falta código o documento válido.', DUPLICADO_EN_ARCHIVO: 'Identidad repetida en el archivo.',
  CODIGO_Y_DOCUMENTO_EN_IDENTIDADES_DISTINTAS: 'Código y documento no corresponden a la misma identidad.',
  DATOS_ESTUDIANTE_CONTRADICTORIOS: 'Los datos difieren del estudiante existente.',
  DOCUMENTO_OMITIDO_POR_CODIGO_FIABLE: 'Documento no validado: se conserva para revisión y se omite de la propuesta. Requiere código fiable sin conflictos.',
  DOCUMENTO_NO_FIABLE_COINCIDE_OTRA_IDENTIDAD: 'El documento dudoso coincide con otra identidad: requiere revisión.',
  DNI_INVALIDO: 'DNI de origen no validado.', DOCUMENTO_INCOMPLETO: 'Documento de origen incompleto.',
  MATRICULA_EXISTENTE_REQUIERE_REVISION: 'La matrícula existente necesita revisión manual.',
  SECCION_INEXISTENTE_O_NO_AUTORIZADA: 'Pendiente: sección no disponible. Esta fila se omite; puedes importar las demás.',
  ANIO_NO_COINCIDE: 'El año del archivo no coincide con el seleccionado.',
  NIVEL_O_GRADO_INVALIDO: 'Nivel o grado no reconocido.', CONTEXTO_MATRICULA_INVALIDO: 'Año, sección o fecha incompatibles para el alta.',
  FECHA_EFECTIVA_REQUERIDA: 'Se necesita una fecha efectiva explícita.',
  TELEFONO_REQUIERE_SELECCION_O_CORRECCION: 'Celular inválido o con varios números: requiere revisión.',
  CONTACTO_SIN_IDENTIDAD_FIABLE: 'Apoderado sin documento fiable: no se propone vincularlo.',
  TIPO_DOCUMENTO_PENDIENTE: 'Tipo de documento pendiente de validación.',
  ALTA_INDEPENDIENTE_REQUIERE_ADMIN: 'Una identidad nueva sin matrícula requiere ADMIN.',
};
export const observationLabel = (reason: string) => reasons[reason] ?? 'Dato pendiente de revisión manual.';
export function operationLabel(row: PreviewRow) {
  if (academicConflict(row)) return 'Operación bloqueada';
  if (row.ya_matriculado) return row.propuestas.length ? 'Revisar contacto o celular' : '';
  if (row.propuestas.includes('CREAR_MATRICULA_INICIAL')) return 'Propuesta de matrícula ACTIVA';
  if (row.estado_original.trim().toUpperCase() === 'TRASLADADO') return 'Identidad sin nueva matrícula';
  if (row.propuestas.includes('CREAR_ESTUDIANTE')) return 'Incorporar identidad';
  return row.propuestas.length ? 'Propuesta de contacto' : 'Identidad conservada; sin cambios';
}
export function importFormError(file: File | null, selection: ImportSelection, year?: SchoolYear) {
  if (!file || !/\.xlsx$/i.test(file.name)) return 'Selecciona un archivo XLSX.';
  if (file.size === 0 || file.size > 5_000_000) return 'El archivo debe contener datos y no superar 5 MB.';
  if (!year || !selection.nivel || !selection.fecha_ingreso) return 'Selecciona año, nivel y fecha efectiva.';
  if (!validCivilDate(selection.fecha_ingreso)) return 'Selecciona una fecha efectiva válida.';
  if (selection.fecha_ingreso < year.fecha_inicio || selection.fecha_ingreso > year.fecha_fin) return 'La fecha efectiva debe estar dentro del año escolar.';
  return '';
}
