import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter;
const state = { role: 'ADMIN', calls: [], fail: false, empty: false, rows: [] };
window.auditTest = state;
state.rows = Array.from({ length: 45 }, (_, index) => {
  const action = ['CREAR_SECCION', 'CREAR_EXCEPCION_LECTIVA', 'CREAR_MATRICULA', 'ABRIR_SESION', 'CREAR_ASIGNACION'][index % 5];
  return { id: String(1000 - index), fecha_hora: new Date(Date.UTC(2026, 10, 21, 12, 0, 45 - index)).toISOString(),
    usuario: { id: '77', nombre_completo: 'María Elena Ficticia', usuario: 'admin_ficticio', rol: 'ADMIN' },
    accion: action, accion_nombre: action, entidad: 'secciones', registro_id: String(index + 1),
    descripcion: `${action} en secciones #${index + 1}.` };
});
state.rows[0] = { ...state.rows[0], origen: 'asistencia', accion: 'CAMBIO_ASISTENCIA', entidad: 'asistencias',
  accion_nombre: 'Cambio individual de asistencia', descripcion: 'Cambio individual de asistencia.',
  asistencia: { tipo: 'JUSTIFICACION', fecha: '2026-11-13', estudiante: { id: '80', nombre_completo: 'Estudiante Ficticio' },
    seccion: { id: '30', nivel: 'PRIMARIA', grado: 1, letra: 'A' }, estado_anterior: 'FALTA', estado_nuevo: 'TARDANZA',
    justificada_anterior: true, justificada_nueva: true, motivo_justificacion_anterior: 'Aviso anterior ficticio',
    motivo_justificacion_nuevo: 'Aviso nuevo ficticio', motivo: 'Corrección ficticia' } };
state.rows[1].usuario = { id: '89', nombre_completo: 'Desconocido', usuario: '', rol: '' };
state.rows[2].usuario = { id: '90', nombre_completo: 'Sistema', usuario: '', rol: '' };
const categories = {
  ASISTENCIAS: ['CAMBIO_ASISTENCIA', 'ABRIR_SESION', 'CERRAR_SESION_ASISTENCIA'],
  SECCIONES_ASIGNACIONES: ['CREAR_SECCION', 'CREAR_ASIGNACION', 'FINALIZAR_ASIGNACION'],
  ESTUDIANTES_MATRICULAS: ['CREAR_MATRICULA', 'RETIRAR_MATRICULA', 'IMPORTAR_PADRON'],
  CALENDARIO_ESCOLAR: ['CREAR_EXCEPCION_LECTIVA', 'CREAR_ANIO_ESCOLAR', 'CREAR_PERIODO_LECTIVO', 'ACTUALIZAR_PERIODO_LECTIVO'],
};
for (const accion of ['CREAR_USUARIO', 'CAMBIAR_PASSWORD', 'RESTABLECER_PASSWORD', 'CREAR_SUPERUSUARIO_LOCAL', 'ACTIVIDAD_TECNICA', 'ACTUALIZAR_TELEFONO_APODERADO']) {
  state.rows.push({ ...state.rows[1], id: accion, accion, descripcion: 'NO_MOSTRAR_EVENTO_TECNICO' });
}
httpClient.defaults.adapter = async config => {
  if (config.url === '/auth/me') { const result = await previous(config); result.data.user.rol = state.role; return result; }
  if (!config.url.startsWith('/auditoria')) return previous(config);
  const params = Object.fromEntries(new URLSearchParams(config.url.split('?')[1]));
  state.calls.push({ method: config.method, params });
  if (state.fail) throw new AxiosError('Detalle privado', '', config, null, { status: 500, data: {} });
  const page = Number(params.page || 1), limit = Number(params.limit || 20);
  const actions = params.categoria ? categories[params.categoria] : Object.values(categories).flat();
  const rows = state.empty ? [] : state.rows.filter(row => actions.includes(row.accion));
  return { config, status: 200, data: { registros: structuredClone(rows.slice((page - 1) * limit, page * limit)),
    pagination: { page, limit, has_more: page * limit < rows.length } } };
};
