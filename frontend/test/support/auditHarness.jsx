import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter;
const state = { role: 'ADMIN', calls: [], fail: false, empty: false, rows: [] };
window.auditTest = state;
state.rows = Array.from({ length: 45 }, (_, index) => {
  const action = ['CREAR_SECCION', 'CREAR_EXCEPCION_LECTIVA', 'CREAR_USUARIO', 'ABRIR_SESION', 'ACTIVIDAD_NUEVA'][index % 5];
  return { id: String(1000 - index), fecha_hora: new Date(Date.UTC(2026, 10, 21, 12, 0, 45 - index)).toISOString(),
    usuario: { id: '77', nombre_completo: 'María Elena Ficticia', usuario: 'admin_ficticio', rol: 'ADMIN' },
    accion: action, accion_nombre: action, entidad: 'secciones', registro_id: String(index + 1),
    descripcion: action === 'CREAR_USUARIO' ? 'Creación de cuenta para Lucía Ficticia (@cuenta_demo) · REGISTRADOR.'
      : action === 'ACTIVIDAD_NUEVA' ? 'Actividad escolar registrada por el sistema.' : `${action} en secciones #${index + 1}.` };
});
state.rows[0] = { ...state.rows[0], accion: 'CREAR_SUPERUSUARIO_LOCAL', accion_nombre: 'Alta inicial local de SUPERUSUARIO',
  usuario: { id: '88', nombre_completo: 'Herramienta local de inicialización', usuario: 'inicializacion_local', rol: '' } };
state.rows[1].usuario = { id: '89', nombre_completo: 'Desconocido', usuario: '', rol: '' };
state.rows[2].usuario = { id: '90', nombre_completo: 'Sistema', usuario: '', rol: '' };
httpClient.defaults.adapter = async config => {
  if (config.url === '/auth/me') { const result = await previous(config); result.data.user.rol = state.role; return result; }
  if (!config.url.startsWith('/auditoria')) return previous(config);
  const params = Object.fromEntries(new URLSearchParams(config.url.split('?')[1]));
  state.calls.push({ method: config.method, params });
  if (state.fail) throw new AxiosError('Detalle privado', '', config, null, { status: 500, data: {} });
  const page = Number(params.page || 1), limit = Number(params.limit || 20);
  const rows = state.empty ? [] : state.rows.filter(row => !params.accion || row.accion === params.accion);
  return { config, status: 200, data: { registros: structuredClone(rows.slice((page - 1) * limit, page * limit)),
    pagination: { page, limit, has_more: page * limit < rows.length } } };
};
