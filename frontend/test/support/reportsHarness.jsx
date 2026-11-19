import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter;
const state = { role: 'ADMIN', calls: [], downloads: [], created: [], revoked: [], fail: 0, multiple: false, empty: false };
window.reportsTest = state;
URL.createObjectURL = blob => { state.created.push({ type: blob.type, size: blob.size }); return `blob:ficha-${state.created.length}`; };
URL.revokeObjectURL = url => state.revoked.push(url);
HTMLAnchorElement.prototype.click = function () { state.downloads.push({ name: this.download, url: this.href }); };
httpClient.defaults.adapter = async config => {
  if (config.url === '/auth/me') { const result = await previous(config); result.data.user.rol = state.role; return result; }
  if (config.url === '/anios-escolares') return { config, status: 200, data: { anios_escolares: [{ id: '10', anio: 2026, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', estado: 'CERRADO' }], pagination: { page: 1, has_more: false } } };
  if (config.url === '/secciones/') return { config, status: 200, data: { secciones: state.empty ? [] : [
    { id: '20', anio_escolar_id: '10', nivel: 'PRIMARIA', grado: 1, letra: 'A', activo: true },
    ...(state.multiple ? [{ id: '21', anio_escolar_id: '10', nivel: 'SECUNDARIA', grado: 2, letra: 'B', activo: false }] : []),
  ], pagination: { page: 1, has_more: false } } };
  if (config.url !== '/reportes/asistencia-mensual.pdf') return previous(config);
  state.calls.push({ method: config.method, params: config.params });
  if (state.fail) throw new AxiosError('Fallo ficticio', '', config, null, { status: state.fail, data: new Blob([JSON.stringify({ error: 'La sección supera los 30 estudiantes.' })]) });
  return { config, status: 200, headers: { 'content-type': 'application/pdf' }, data: new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }) };
};
