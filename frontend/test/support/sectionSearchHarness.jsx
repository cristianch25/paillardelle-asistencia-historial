import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { attendanceMock } from './attendanceMock.mjs';
import { catalogResponse, sectionCatalog, catalogYear } from './sectionSearchFixture.mjs';

const authAdapter = httpClient.defaults.adapter, attendance = attendanceMock();
const controls = { calls: [], role: 'ADMIN', account: '9007199254740993', level: null,
  allowedLevels: ['PRIMARIA', 'SECUNDARIA', 'INICIAL'], total: 230, holdPage: 0, pending: [], failPage: 0, status: 'network',
  invalidPage: 0, disappear: false, verifying: false };
window.sectionSearchTest = controls;
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) {
    const response = await authAdapter(config);
    if (config.url === '/auth/me') Object.assign(response.data.user, {
      id: controls.account, rol: controls.role, nivel_asignado: controls.level,
    });
    return response;
  }
  controls.calls.push({ method: config.method, url: config.url, params: config.params });
  const fail = status => { throw new AxiosError('Detalle privado', '', config, null, status === 'network' ? undefined : { config, status }); };
  if (config.url === '/asignaciones') return { config, data: { asignaciones: [],
    pagination: { page: config.params.page, limit: config.params.limit, has_more: false } }, status: 200, statusText: 'OK', headers: {} };
  if (config.url === '/anios-escolares') return { config, data: { anios_escolares: [catalogYear, { ...catalogYear, id: '2', anio: 2025 }],
    pagination: { page: 1, limit: 100, has_more: false } }, status: 200, statusText: 'OK', headers: {} };
  if (config.url === '/secciones/') {
    if (config.params.limit === 100) controls.verifying = true;
    const params = config.params;
    let rows = sectionCatalog(controls.total, params.anio_escolar_id ?? '1');
    if (controls.disappear) rows = [];
    if (controls.role === 'SUBDIRECCION') rows = rows.filter(row => controls.allowedLevels.includes(row.nivel));
    if (controls.role === 'REGISTRADOR') rows = rows.filter(row => row.id === sectionCatalog()[150].id);
    const result = catalogResponse(config, rows), status = params.page === controls.failPage ? controls.status : null;
    if (params.page === controls.invalidPage) result.data.pagination.page = 0;
    if (params.page === controls.holdPage) await new Promise(resolve => controls.pending.push(resolve));
    if (status) fail(status);
    return result;
  }
  return attendance.adapter(config);
};
