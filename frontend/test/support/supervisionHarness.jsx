import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { supervisionResult, supervisionCards, year } from './supervisionFixture.mjs';
import { supervisionDetail, sessionId } from './supervisionDetailFixture.mjs';

const authAdapter = httpClient.defaults.adapter;
const controls = { calls: [], pending: [], hold: false, status: null, empty: false, cards: false,
  optionsPending: [], optionsHoldPage: 0, optionsStatus: null, optionsCount: 2,
  detailStatus: null, detailHold: false, detailPending: [], detailState: 'ABIERTA', detailEmptyState: null, sectionStatus: null,
  role: 'SUBDIRECCION', level: 'PRIMARIA', account: '9007199254740993' };
window.supervisionTest = controls;
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) {
    const response = await authAdapter(config);
    if (config.url === '/auth/me') Object.assign(response.data.user, {
      id: controls.account, rol: controls.role, nivel_asignado: controls.level,
    });
    return response;
  }
  controls.calls.push({ method: config.method, url: config.url, params: config.params });
  let data;
  if (config.url === '/anios-escolares') data = { anios_escolares: [year, { ...year, id: '2', anio: 2025, estado: 'PLANIFICADO' }],
    pagination: { page: 1, limit: 100, has_more: false } };
  else if (config.url === '/asistencias/sesiones') {
    // Capturar la respuesta al iniciar, para simular respuestas de consultas antiguas.
    data = supervisionResult(config.params);
    if (config.params.limit === 1) {
      if (controls.sectionStatus) throw new AxiosError('Privado', '', config, null, { config, status: controls.sectionStatus });
      data.secciones[0].sesion_id = config.params.seccion_id === '9007199254740995' ? sessionId : '9007199254741996';
    }
    const options = config.params.limit === 100;
    if (options) {
      const start = (config.params.page - 1) * 100;
      data.secciones = Array.from({ length: Math.min(100, Math.max(0, controls.optionsCount - start)) }, (_, index) => ({
        ...data.secciones[0], seccion: { ...data.secciones[0].seccion,
          id: String(9007199254740995n + BigInt(start + index)), letra: `GRUPO ${start + index + 1}` },
      }));
      data.pagination.has_more = start + 100 < controls.optionsCount;
    } else if (controls.empty) data.secciones = [];
    else if (controls.cards && config.params.limit !== 1) data.secciones = supervisionCards(config.params);
    const status = options ? controls.optionsStatus : controls.status;
    if (options && config.params.page === controls.optionsHoldPage) {
      await new Promise(resolve => controls.optionsPending.push(resolve));
    } else if (!options && controls.hold) await new Promise(resolve => controls.pending.push(resolve));
    if (status) throw new AxiosError('Detalle privado', '', config, null, status === 'network' ? undefined : { config, status });
  } else if (config.url.startsWith('/asistencias/sesiones/')) {
    data = supervisionDetail(config.url.split('/').at(-1), controls.detailState);
    if (controls.detailEmptyState) {
      data.padron = data.padron.filter(row => row.estado !== controls.detailEmptyState);
      const keys = { PRESENTE: 'presentes', TARDANZA: 'tardanzas', FALTA: 'faltas', PENDIENTE: 'pendientes' };
      data.resumen.total -= data.resumen[keys[controls.detailEmptyState]];
      data.resumen[keys[controls.detailEmptyState]] = 0;
    }
    const status = controls.detailStatus;
    if (controls.detailHold) await new Promise(resolve => controls.detailPending.push(resolve));
    if (status) throw new AxiosError('Detalle privado', '', config, null, status === 'network' ? undefined : { config, status });
  } else throw new Error(`Lectura no prevista: ${config.url}`);
  return { config, data, status: 200, statusText: 'OK', headers: {} };
};
