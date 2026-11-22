import { calendarAuditDescription } from './calendar-description.js';

export const ACTION_LABELS = {
  CREAR_USUARIO: 'Crear usuario',
  ACTUALIZAR_USUARIO: 'Actualizar usuario',
  RESTABLECER_PASSWORD: 'Restablecer contraseña',
  CAMBIAR_PASSWORD: 'Cambiar contraseña',
  CREAR_ASIGNACION: 'Asignar docente',
  ASIGNAR_DOCENTE: 'Asignar docente',
  FINALIZAR_ASIGNACION: 'Finalizar asignación',
  CREAR_ANIO_ESCOLAR: 'Crear año escolar',
  ACTUALIZAR_ANIO_ESCOLAR: 'Actualizar año escolar',
  CREAR_SECCION: 'Crear sección',
  ACTUALIZAR_SECCION: 'Actualizar sección',
  REGISTRAR_CALENDARIO: 'Configurar calendario',
  CREAR_CALENDARIO_LECTIVO: 'Configurar calendario',
  CREAR_MATRICULA: 'Matricular estudiante',
  MATRICULAR_ESTUDIANTE: 'Matricular estudiante',
  RETIRAR_MATRICULA: 'Retirar matrícula',
  CAMBIO_SECCION: 'Cambiar sección',
  CAMBIAR_SECCION_MATRICULA: 'Cambiar sección',
  REINGRESAR_MATRICULA: 'Reingresar estudiante',
  IMPORTAR_PADRON: 'Importar padrón',
  CONFIRMAR_IMPORTACION_SIAGIE: 'Importar padrón',
  ABRIR_SESION_ASISTENCIA: 'Creación de sesión de asistencia',
  ABRIR_SESION: 'Creación de sesión de asistencia',
  CERRAR_SESION_ASISTENCIA: 'Cierre de sesión de asistencia',
  CERRAR_SESION: 'Cierre de sesión de asistencia',
  ACTUALIZAR_TELEFONO_APODERADO: 'Actualizar teléfono',
  ACTUALIZAR_SUPERVISION: 'Actualizar supervisión',
};

export function formatAuditAction(action) {
  if (!action) return 'Operación';
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .split('_')
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()))
    .join(' ');
}

export function formatSectionLabel(grado, letra, nivel) {
  if (!grado || !letra) return null;
  const gradeStr = nivel === 'INICIAL' ? `${grado} años` : `${grado}.º`;
  const levelStr = nivel ? ` ${nivel.charAt(0) + nivel.slice(1).toLowerCase()}` : '';
  return `${gradeStr} ${letra}${levelStr}`;
}

export function formatStudentName(paterno, materno, nombres) {
  const apellidos = [paterno, materno].filter(Boolean).join(' ');
  if (!apellidos && !nombres) return null;
  return apellidos ? `${apellidos}, ${nombres || ''}`.trim() : nombres;
}

export function formatUserName(nombres, apellidos, username, rol) {
  const full = [nombres, apellidos].filter(Boolean).join(' ');
  if (!full && !username) return null;
  const userTag = username ? ` (@${username})` : '';
  const rolTag = rol ? ` · ${rol}` : '';
  return `${full || username}${userTag}${rolTag}`;
}

export function formatAuditDescription(row) {
  const calendar = calendarAuditDescription(row);
  if (calendar !== null) return calendar;
  const { accion, entidad, registro_id, descripcion } = row;
  const targetId = registro_id ? ` #${registro_id}` : '';
  const student = formatStudentName(row.estudiante_apellido_paterno, row.estudiante_apellido_materno, row.estudiante_nombres);
  const targetUser = formatUserName(row.target_nombres, row.target_apellidos, row.target_usuario, row.target_rol);
  const asgDocente = formatUserName(row.asg_docente_nombres, row.asg_docente_apellidos, row.asg_docente_usuario);
  const asgSeccion = formatSectionLabel(row.asg_seccion_grado, row.asg_seccion_letra, row.asg_seccion_nivel);
  const origenSeccion = formatSectionLabel(row.origen_grado, row.origen_letra, row.origen_nivel);
  const destinoSeccion = formatSectionLabel(row.destino_grado, row.destino_letra, row.destino_nivel);
  const retiroSeccion = formatSectionLabel(row.retiro_grado, row.retiro_letra, row.retiro_nivel);

  switch (accion) {
    case 'RETIRAR_MATRICULA':
      if (student && retiroSeccion) return `Retiro de ${student} (${retiroSeccion}).`;
      if (student) return `Retiro de ${student} (matrícula${targetId}).`;
      return `Retiro de matrícula${targetId}.`;

    case 'CAMBIO_SECCION':
    case 'CAMBIAR_SECCION_MATRICULA':
      if (student && origenSeccion && destinoSeccion) {
        return `Cambio de sección de ${student}: de ${origenSeccion} a ${destinoSeccion}.`;
      }
      if (student && destinoSeccion) return `Cambio de sección de ${student} a ${destinoSeccion}.`;
      if (student) return `Cambio de sección de ${student} (matrícula${targetId}).`;
      if (origenSeccion && destinoSeccion) return `Cambio de sección de ${origenSeccion} a ${destinoSeccion} (matrícula${targetId}).`;
      return `Cambio de sección en matrícula${targetId}.`;

    case 'REINGRESAR_MATRICULA':
      if (student && destinoSeccion) return `Reingreso de ${student} en ${destinoSeccion}.`;
      if (student) return `Reincorporación de ${student} (matrícula${targetId}).`;
      if (destinoSeccion) return `Reingreso en ${destinoSeccion} (matrícula${targetId}).`;
      return `Reincorporación de estudiante en matrícula${targetId}.`;

    case 'CREAR_MATRICULA':
    case 'MATRICULAR_ESTUDIANTE':
      if (student && destinoSeccion) return `Nueva matrícula de ${student} en ${destinoSeccion}.`;
      if (student) return `Nueva matrícula de ${student}.`;
      return `Registro de nueva matrícula${targetId}.`;

    case 'RESTABLECER_PASSWORD':
      if (targetUser) return `Restablecimiento de contraseña para ${targetUser}.`;
      return `Restablecimiento administrativo de contraseña para usuario${targetId}.`;

    case 'CAMBIAR_PASSWORD':
      return 'El usuario cambió su propia contraseña.';

    case 'CREAR_USUARIO':
      if (targetUser) return `Creación de cuenta para ${targetUser}.`;
      return `Creación de cuenta de usuario${targetId}.`;

    case 'ACTUALIZAR_USUARIO':
      if (targetUser) return `Actualización de cuenta para ${targetUser}.`;
      return `Actualización de cuenta de usuario${targetId}.`;

    case 'CREAR_ASIGNACION':
    case 'ASIGNAR_DOCENTE':
      if (asgDocente && asgSeccion) return `Asignación de ${asgDocente} a la sección ${asgSeccion}.`;
      if (asgDocente) return `Asignación de docente ${asgDocente}.`;
      return `Asignación de usuario a sección${targetId}.`;

    case 'FINALIZAR_ASIGNACION':
      if (asgDocente && asgSeccion) return `Cese de asignación de ${asgDocente} en ${asgSeccion}.`;
      if (asgDocente) return `Cese de asignación de ${asgDocente}.`;
      return `Finalización de asignación a sección${targetId}.`;

    case 'CREAR_SECCION':
      return `Creación de sección académica${targetId}.`;
    case 'ACTUALIZAR_SECCION':
      return `Actualización de sección académica${targetId}.`;
    case 'CREAR_ANIO_ESCOLAR':
      return `Creación de año escolar${targetId}.`;
    case 'ACTUALIZAR_ANIO_ESCOLAR':
      return `Actualización de año escolar${targetId}.`;
    case 'ABRIR_SESION_ASISTENCIA':
    case 'ABRIR_SESION':
      return 'Se creó la sesión para registrar la asistencia del día.';
    case 'CERRAR_SESION_ASISTENCIA':
    case 'CERRAR_SESION':
      return 'Se cerró la sesión de asistencia. Este cierre no impide las correcciones autorizadas.';
    case 'ACTUALIZAR_TELEFONO_APODERADO':
      return `Actualización de teléfono de contacto${targetId}.`;
    case 'IMPORTAR_PADRON':
    case 'CONFIRMAR_IMPORTACION_SIAGIE':
      return 'Importación de nómina de estudiantes.';

    default:
      if (descripcion && typeof descripcion === 'string' && !/(password|hash|token|secret|clave)/i.test(descripcion)) {
        return descripcion;
      }
      return `${formatAuditAction(accion)} en ${entidad}${targetId}.`;
  }
}
