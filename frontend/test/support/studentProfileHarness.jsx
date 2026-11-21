import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { studentProfileResponse } from './studentProfileFixture.mjs';

const source = new URLSearchParams(location.search).get('source');
if (source === 'stats') await import('./statisticsHarness.jsx');
else if (source === 'search') await import('./integratedAttendanceHarness.jsx');
else await import('./navigationHarness.jsx');
const previous = httpClient.defaults.adapter;
const controls = { calls: [], status: null, hold: false, pending: [], contact: true, role: null, sectionChange: false };
controls.phone = { value: '900000001', shared: true, preview: null, confirmStatus: null, hold: false, pending: [], writes: 0, noGuardian: false, applyBeforeError: false };
window.profileTest = controls;
httpClient.defaults.adapter = async config => {
  const phoneMatch = /^\/estudiantes\/([1-9]\d*)\/apoderado\/telefono(?:\/vista-previa)?$/.exec(config.url);
  if (phoneMatch) {
    const body = JSON.parse(config.data); controls.calls.push({ method: config.method, url: config.url, body });
    if (config.method === 'post') {
      const data = { telefono_actual: controls.phone.value, telefono_propuesto: body.telefono, afecta_otros_vinculos: controls.phone.shared,
        sin_cambios: body.telefono === controls.phone.value, token_confirmacion: 'a'.repeat(64), vence_en: '2099-01-01T00:00:00.000Z' };
      controls.phone.preview = data; return { config, data, status: 200 };
    }
    const status = controls.phone.confirmStatus;
    if (controls.phone.hold) await new Promise(resolve => controls.phone.pending.push(resolve));
    if (status) {
      if (controls.phone.applyBeforeError) { controls.phone.value = controls.phone.preview.telefono_propuesto; controls.phone.writes++; }
      throw new AxiosError('Privado', '', config, null, { config, status });
    }
    controls.phone.value = controls.phone.preview.telefono_propuesto; controls.phone.writes++;
    return { config, data: { telefono: controls.phone.value, actualizado: true }, status: 200 };
  }
  const match = /^\/estudiantes\/([1-9]\d*)\/perfil$/.exec(config.url);
  if (!match) {
    const response = await previous(config);
    if (config.url === '/auth/me' && controls.role) response.data.user.rol = controls.role;
    if (config.url === '/auth/me' && controls.cargo) response.data.user.cargo = controls.cargo;
    return response;
  }
  controls.calls.push({ method: config.method, url: config.url, params: config.params });
  const data = studentProfileResponse(match[1], config.params.anio_escolar_id, config.params.mes), status = controls.status;
  if (controls.sectionChange) {
    const moved = { ...data.contexto.seccion_actual, id: '3', letra: 'OTRA SECCIÓN' };
    data.contexto.secciones[0].fecha_fin = `${config.params.mes}-14`;
    data.contexto.secciones.push({ ...moved, fecha_inicio: `${config.params.mes}-15`, fecha_fin: null });
    data.contexto.seccion_actual = moved;
    for (const day of data.dias) if (day.fecha.slice(-2) >= '15') day.seccion = moved;
  }
  data.apoderado.telefono = controls.phone.value;
  if (controls.phone.noGuardian) data.apoderado = null;
  if (!controls.contact) { data.apoderado_visible = false; data.apoderado = null; }
  if (controls.hold) await new Promise(resolve => controls.pending.push(resolve));
  if (status) throw new AxiosError('Privado', '', config, null, { config, status });
  return { config, data, status: 200, headers: {} };
};
