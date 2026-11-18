import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { importPreviewFixture } from './importPreviewFixture.mjs';

const previous = httpClient.defaults.adapter;
const state = { role: 'ADMIN', selected: [], calls: [], fail: false,
  phones: {}, phoneFail: false, phoneHold: false, pending: [] };
window.importTest = state;
httpClient.defaults.adapter = async config => {
  if (config.url === '/auth/me') {
    const response = await previous(config); response.data.user.rol = state.role; return response;
  }
  if (config.url === '/anios-escolares') return { config, status: 200, data: { anios_escolares: [{ id: '10', anio: 2026,
    estado: 'ABIERTO', fecha_inicio: '2026-03-01', fecha_fin: '2026-12-31' }], pagination: { page: 1, limit: 100, has_more: false } } };
  if (!config.url.startsWith('/importaciones')) return previous(config);
  state.calls.push({ url: config.url, method: config.method, params: config.params });
  if (state.fail) throw new AxiosError('Error privado', '', config, null, { config, status: 400, data: { error: 'El nivel real del archivo no corresponde al nivel seleccionado.' } });
  let data;
  const phone = /\/filas\/([^/]+)\/contacto$/.exec(config.url);
  if (phone && config.method === 'patch') {
    const rowId = decodeURIComponent(phone[1]), body = JSON.parse(config.data);
    if (state.phoneHold) await new Promise(resolve => state.pending.push(resolve));
    if (state.phoneFail || body.version !== (state.phones[rowId]?.version ?? 1)) {
      throw new AxiosError('Privado', '', config, null, { config, status: 409, data: { error: 'La fila cambió. Consulta la vista previa y vuelve a corregir.' } });
    }
    state.phones[rowId] = { version: body.version + 1, telefono: body.telefono };
    data = importPreviewFixture(1, state.selected);
  }
  else if (config.url.endsWith('/niveles')) data = { niveles: state.role === 'SUBDIRECCION' ? ['INICIAL'] : ['INICIAL', 'PRIMARIA', 'SECUNDARIA'] };
  else if (config.url === '/importaciones/vistas-previas' && config.method === 'post') {
    data = importPreviewFixture(); state.selected = data.filas_seleccionadas;
  }
  else if (config.url.endsWith('/seleccion')) { state.selected = JSON.parse(config.data).filas; data = { filas_seleccionadas: state.selected, confirmacion_habilitada: false }; }
  else data = importPreviewFixture(Number(config.params?.page ?? 1), state.selected);
  for (const row of data.registros ?? []) {
    const correction = state.phones[row.id]; if (!correction) continue;
    Object.assign(row.contacto, { telefono_propuesto: correction.telefono, version: correction.version, corregido: true });
    row.observaciones = row.observaciones.filter(item => item.campo !== 'apoderado.telefonos_originales');
    data.resumen.filas_con_observaciones = 2;
  }
  return { config, status: 200, data };
};
