import './superusuarioHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter;
const controls = { calls: [], fail: false, empty: false, hold: false, pending: [] };
window.securityTest = controls;
controls.rows = Array.from({ length: 42 }, (_, i) => ({ id: String(100 - i),
  fecha_hora: new Date(Date.UTC(2026, 10, 22, 15, 0, 42 - i)).toISOString(),
  evento: ['Alta local de SUPERUSUARIO', 'Usuario creado', 'Cuenta activada', 'Cuenta desactivada',
    'Contraseña restablecida', 'Contraseña cambiada', 'Usuario actualizado', 'Permisos de usuario actualizados'][i % 8],
  responsable: i === 0 ? { id: null, nombre: 'Herramienta local de inicialización' } : { id: '1', nombre: 'Responsable ficticio' },
  cuenta: { id: '2', nombre: `Cuenta ficticia ${i}` },
}));
httpClient.defaults.adapter = async config => {
  if (config.url !== '/seguridad') return previous(config);
  controls.calls.push({ method: config.method, params: config.params });
  if (controls.hold) await new Promise(resolve => controls.pending.push(resolve));
  if (controls.fail) throw new AxiosError('Error técnico privado', '', config, null, { config, status: 500, data: {} });
  const { page, limit } = config.params, rows = controls.empty ? [] : controls.rows;
  return { config, status: 200, data: { registros: structuredClone(rows.slice((page - 1) * limit, page * limit)),
    pagination: { page, limit, has_more: page * limit < rows.length } } };
};
