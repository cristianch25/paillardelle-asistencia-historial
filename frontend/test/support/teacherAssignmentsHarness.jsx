import './usuariosHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter, state = window.usersTest;
state.role = 'SUBDIRECCION'; state.level = 'PRIMARIA';
state.sections.push({ ...state.sections[0], id: '9007199254741024', nivel: 'INICIAL', grado: 3, letra: 'A' });
httpClient.defaults.adapter = async config => {
  const levels = state.level === 'PRIMARIA' ? ['INICIAL', 'PRIMARIA'] : [state.level];
  if (config.url.startsWith('/auth/')) {
    const result = await previous(config);
    if (config.url === '/auth/me') Object.assign(result.data.user, { nivel_asignado: state.level, niveles_adicionales: ['SECUNDARIA', 'INICIAL', 'PRIMARIA'] });
    return result;
  }
  if (config.url.startsWith('/asignaciones')) {
    const body = config.data ? JSON.parse(config.data) : undefined;
    state.calls.push({ method: config.method, url: config.url, body });
    const fail = status => { throw new AxiosError('Simulado', '', config, null, { config, status, data: { error: 'Conflicto de asignación. No se guardó ninguna sección.' } }); };
    const sections = state.sections.filter(row => levels.includes(row.nivel));
    if (state.role !== 'SUBDIRECCION') fail(403);
    let data, status = 200;
    if (config.method === 'get') {
      if (state.status) fail(state.status);
      const [key, rows] = config.url.endsWith('/registradores') ? ['registradores', state.users.filter(row => row.rol === 'REGISTRADOR' && row.activo && (!row.nivel_asignado || levels.includes(row.nivel_asignado)))]
        : config.url.endsWith('/secciones') ? ['secciones', sections] : ['asignaciones', state.assignments.filter(row => sections.some(section => section.id === row.seccion_id))];
      data = { [key]: rows, pagination: { page: config.params.page, limit: 100, has_more: false } };
    } else if (config.method === 'post') {
      if (state.writeStatus) fail(state.writeStatus);
      if (body.seccion_ids.some(id => !sections.some(row => row.id === id)
        || state.assignments.some(row => row.usuario_id === body.usuario_id && row.seccion_id === id
          && row.fecha_inicio <= (body.fecha_fin ?? '9999-12-31') && (!row.fecha_fin || row.fecha_fin >= body.fecha_inicio)))) fail(409);
      const rows = body.seccion_ids.map((id, index) => ({ id: String(9007199254760000n + BigInt(state.assignments.length + index)),
        usuario_id: body.usuario_id, seccion_id: id, fecha_inicio: body.fecha_inicio, fecha_fin: body.fecha_fin }));
      state.assignments.push(...rows); data = { asignaciones: rows }; status = 201;
    } else {
      const row = state.assignments.find(item => item.id === config.url.split('/')[2]);
      if (!row || !sections.some(section => section.id === row.seccion_id)) fail(403);
      if (row.fecha_fin !== body.fecha_fin_esperada) fail(409);
      const end = new Date(`${body.fecha_efectiva}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
      row.fecha_fin = end.toISOString().slice(0, 10); data = { asignacion: row };
    }
    return { config, data: structuredClone(data), status, statusText: 'OK', headers: {} };
  }
  return previous(config);
};
