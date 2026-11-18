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
    if (config.method === 'post') {
      const row = { ...body, id: '9007199254741999', turno: null, activo: true }; state.rows.push(row);
      return result({ seccion: row }, 201);
    }
    const row = state.rows.find(item => config.url === `/secciones/${item.id}`);
    Object.assign(row, body.cambios); return result({ seccion: row });
  }
  return previous(config);
};
