import { roleLabels } from '../auth/userPresentation';
import type { UserRole } from '../auth/auth.types';
import type { AuditRecord, AuditUser } from './auditoria.types';

const labels: Record<string, string> = {
  CAMBIO_ASISTENCIA: 'Cambio individual de asistencia',
  CREAR_USUARIO: 'Usuario creado', ACTUALIZAR_USUARIO: 'Usuario actualizado',
  CAMBIAR_ESTADO_USUARIO: 'Estado de cuenta actualizado',
  CAMBIAR_PASSWORD: 'Contraseña cambiada', RESTABLECER_PASSWORD: 'Contraseña restablecida',
  CREAR_SUPERUSUARIO_LOCAL: 'Cuenta de superusuario creada',
  ACTUALIZAR_NIVELES_ADICIONALES: 'Niveles autorizados actualizados', ACTUALIZAR_SUPERVISION: 'Supervisión actualizada',
  CREAR_SECCION: 'Sección creada', ACTUALIZAR_SECCION: 'Sección actualizada',
  CREAR_MATRICULA: 'Estudiante matriculado', MATRICULAR_ESTUDIANTE: 'Estudiante matriculado',
  RETIRAR_MATRICULA: 'Matrícula retirada', REINGRESAR_MATRICULA: 'Estudiante reincorporado',
  CAMBIO_SECCION: 'Estudiante cambiado de sección', CAMBIAR_SECCION_MATRICULA: 'Estudiante cambiado de sección',
  IMPORTAR_PADRON: 'Padrón importado', CONFIRMAR_IMPORTACION_SIAGIE: 'Padrón importado',
  CREAR_ASIGNACION: 'Personal asignado a una sección', ASIGNAR_DOCENTE: 'Personal asignado a una sección',
  FINALIZAR_ASIGNACION: 'Asignación de personal finalizada',
  ABRIR_SESION_ASISTENCIA: 'Sesión de asistencia creada', ABRIR_SESION: 'Sesión de asistencia creada',
  CERRAR_SESION_ASISTENCIA: 'Sesión de asistencia cerrada', CERRAR_SESION: 'Sesión de asistencia cerrada',
  CREAR_ANIO_ESCOLAR: 'Año escolar creado', ACTUALIZAR_ANIO_ESCOLAR: 'Año escolar actualizado',
  ABRIR_ANIO_ESCOLAR: 'Año escolar abierto', CERRAR_ANIO_ESCOLAR: 'Año escolar cerrado',
  CREAR_PERIODO_LECTIVO: 'Período de clases creado', ACTUALIZAR_PERIODO_LECTIVO: 'Período de clases actualizado',
  CREAR_EXCEPCION_LECTIVA: 'Excepción del calendario creada', ACTUALIZAR_EXCEPCION_LECTIVA: 'Excepción del calendario actualizada',
  REGISTRAR_CALENDARIO: 'Calendario configurado', CREAR_CALENDARIO_LECTIVO: 'Calendario configurado',
  CREAR_ESTUDIANTE: 'Estudiante registrado', CREAR_APODERADO_IMPORTACION: 'Apoderado registrado por importación',
  ACTUALIZAR_TELEFONO_APODERADO: 'Teléfono actualizado',
};

function readable(value: string) {
  const text = value.replace(/_/g, ' ').toLocaleLowerCase('es');
  return text ? text.charAt(0).toLocaleUpperCase('es') + text.slice(1) : 'Actividad registrada';
}

export function activityName(record: Pick<AuditRecord, 'accion' | 'accion_nombre'>) {
  return labels[record.accion] ?? readable(record.accion_nombre || record.accion);
}

export function responsibleName(user: AuditUser) {
  const name = user.nombre_completo.trim();
  return name && name !== 'Desconocido' ? name : user.usuario ? 'Cuenta sin nombre disponible' : 'Responsable no disponible';
}

export function responsibleRole(role: string) {
  return role === 'SUPERUSUARIO' ? 'Superusuario' : roleLabels[role as UserRole] ?? readable(role);
}

export function activityDetail(record: AuditRecord) {
  const description = record.descripcion.trim();
  if (record.accion === 'CREAR_SUPERUSUARIO_LOCAL') return 'Cuenta creada mediante la herramienta local de inicialización.';
  // El servidor no envía nombres de estos elementos; no inventarlos desde sus IDs.
  if (!description || description.startsWith(`${record.accion_nombre} en `)
    || / en (?:usuarios|secciones|matriculas|contactos|estudiantes|asignaciones|anios_escolares|periodos_lectivos|calendario_lectivo|sesiones_asistencia|usuario_niveles_adicionales)(?: #\d+)?\.?$/.test(description)
    || /^(?:Creación|Actualización) de (?:sección académica|año escolar)(?: #\d+)?\.$/.test(description)) {
    return `${activityName(record)}.`;
  }
  if (['calendario_lectivo', 'periodos_lectivos'].includes(record.entidad)) return description;
  return description.replace(/\s*\(@[^)]+\)/g, '')
    .replace(/\s*·\s*(ADMIN|SUBDIRECCION|REGISTRADOR|SUPERUSUARIO)\b/g, (_, role: string) => ` · ${responsibleRole(role)}`)
    .replace(/\s*\(matrícula(?: #\d+)?\)/g, '')
    .replace(/\s+#\d+\b/g, '');
}

export const auditCategoryOptions = [
  { value: '', label: 'Todas las actividades' },
  { value: 'ASISTENCIAS', label: 'Asistencias' },
  { value: 'SECCIONES_ASIGNACIONES', label: 'Secciones y asignaciones' },
  { value: 'ESTUDIANTES_MATRICULAS', label: 'Estudiantes y matrículas' },
  { value: 'CALENDARIO_ESCOLAR', label: 'Calendario escolar' },
];
