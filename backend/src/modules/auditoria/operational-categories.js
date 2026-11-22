import { HttpError } from '../../shared/http-error.js';

// Lista cerrada de acciones y entidades escolares, incluidos sus alias históricos.
export const operationalCategories = {
  ASISTENCIAS: [
    ['sesiones_asistencia', ['ABRIR_SESION_ASISTENCIA', 'ABRIR_SESION', 'CERRAR_SESION_ASISTENCIA', 'CERRAR_SESION']],
  ],
  SECCIONES_ASIGNACIONES: [
    ['secciones', ['CREAR_SECCION', 'ACTUALIZAR_SECCION']],
    ['asignaciones', ['CREAR_ASIGNACION', 'ASIGNAR_DOCENTE', 'FINALIZAR_ASIGNACION']],
  ],
  ESTUDIANTES_MATRICULAS: [
    ['estudiantes', ['CREAR_ESTUDIANTE']],
    ['matriculas', ['CREAR_MATRICULA', 'MATRICULAR_ESTUDIANTE', 'RETIRAR_MATRICULA', 'REINGRESAR_MATRICULA', 'CAMBIO_SECCION', 'CAMBIAR_SECCION_MATRICULA']],
    ['importaciones', ['IMPORTAR_PADRON', 'CONFIRMAR_IMPORTACION_SIAGIE']],
  ],
  CALENDARIO_ESCOLAR: [
    ['anios_escolares', ['CREAR_ANIO_ESCOLAR', 'ACTUALIZAR_ANIO_ESCOLAR', 'ABRIR_ANIO_ESCOLAR', 'CERRAR_ANIO_ESCOLAR']],
    ['periodos_lectivos', ['CREAR_PERIODO_LECTIVO', 'ACTUALIZAR_PERIODO_LECTIVO']],
    ['calendario_lectivo', ['CREAR_EXCEPCION_LECTIVA', 'ACTUALIZAR_EXCEPCION_LECTIVA', 'REGISTRAR_CALENDARIO', 'CREAR_CALENDARIO_LECTIVO']],
  ],
};

export function readAuditCategory(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || !Object.hasOwn(operationalCategories, value)) throw new HttpError(400, 'Categoría de actividades inválida.');
  return value;
}
