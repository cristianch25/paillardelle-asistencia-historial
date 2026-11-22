import './sectionSearchHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { sectionCatalog, catalogResponse } from './sectionSearchFixture.mjs';

const previous = httpClient.defaults.adapter;
const state = { rows: sectionCatalog(6), writes: [], fail: 0, pending: [], hold: false };
window.sectionManagementTest = state;
httpClient.defaults.adapter = async config => {
  const controls = window.sectionSearchTest;
  const result = (data, status = 200) => ({ config, data, status, statusText: 'OK', headers: {} });
  if (config.url === '/secciones/' && config.method === 'get') {
    if (config.params.nivel && config.params.limit === 1) return previous(config);
    controls.calls.push({ method: config.method, url: config.url, params: config.params });
    if (controls.role === 'REGISTRADOR') return catalogResponse(config, [state.rows[0]]);
    return catalogResponse(config, state.rows.filter(row => row.anio_escolar_id === config.params.anio_escolar_id
      && (controls.role !== 'SUBDIRECCION' || controls.allowedLevels.includes(row.nivel))));
  }
  if (['post', 'patch'].includes(config.method) && config.url.startsWith('/secciones')) {
    const body = JSON.parse(config.data); state.writes.push({ method: config.method, url: config.url, body });
    if (state.hold) await new Promise(resolve => state.pending.push(resolve));
    if (state.fail) throw new AxiosError('privado', '', config, null, { config, status: state.fail,
      data: { error: 'No se puede desactivar: existen matrículas o asignaciones vigentes o futuras.' } });
    if (config.method === 'post' && config.url === '/secciones/lote') {
      const letters = Array.from({ length: body.letra_hasta.charCodeAt(0) - body.letra_desde.charCodeAt(0) + 1 },
        (_, index) => String.fromCharCode(body.letra_desde.charCodeAt(0) + index));
      const duplicate = state.rows.some(row => row.anio_escolar_id === body.anio_escolar_id && row.nivel === body.nivel
        && row.grado === body.grado && letters.includes(row.letra));
      if (duplicate) throw new AxiosError('duplicado', '', config, null, { config, status: 409,
        data: { error: 'Una sección ya existe. No se creó ninguna sección del lote.' } });
      const secciones = letters.map((letra, index) => ({ anio_escolar_id: body.anio_escolar_id, nivel: body.nivel,
        grado: body.grado, letra, id: String(9007199254742000n + BigInt(state.rows.length + index)), turno: null, activo: true }));
      state.rows.push(...secciones); return result({ secciones }, 201);
    }
    if (config.method === 'post') {
      const row = { ...body, id: '9007199254741999', turno: null, activo: true }; state.rows.push(row);
      return result({ seccion: row }, 201);
    }
    const row = state.rows.find(item => config.url === `/secciones/${item.id}`);
    Object.assign(row, body.cambios); return result({ seccion: row });
  }
  return previous(config);
};
