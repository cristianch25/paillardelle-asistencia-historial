import './authHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { peruToday } from '../../src/shared/dates/civilDate';

const previous = httpClient.defaults.adapter, date = peruToday();
const controls = { calls: [], account: '100', hold: false, pending: [], status: null, missing: false };
window.sectionSummaryTest = controls;
const years = [{ id: '1', anio: Number(date.slice(0, 4)), estado: 'ABIERTO', fecha_inicio: `${date.slice(0, 4)}-01-01`, fecha_fin: `${date.slice(0, 4)}-12-31` },
  { id: '2', anio: 2099, estado: 'PLANIFICADO', fecha_inicio: '2099-01-01', fecha_fin: '2099-12-31' }];
const sections = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), anio_escolar_id: i === 4 ? '2' : '1',
  nivel: 'SECUNDARIA', grado: 1, letra: `SECCION ${i + 1}`, turno: null, activo: true }));
httpClient.defaults.adapter = async config => {
  let data;
  if (config.url === '/anios-escolares') data = { anios_escolares: years, pagination: { page: 1, limit: 100, has_more: false } };
  else if (config.url === '/secciones/') {
    const start = (config.params.page - 1) * config.params.limit;
    data = { secciones: sections.slice(start, start + config.params.limit),
      pagination: { page: config.params.page, limit: config.params.limit, has_more: start + config.params.limit < sections.length } };
  } else if (config.url === '/asistencias/sesiones') {
    const params = config.params, snapshot = { status: controls.status, account: controls.account };
    controls.calls.push({ ...params, account: snapshot.account });
    const authorized = sections.filter(s => s.anio_escolar_id === params.anio_escolar_id);
    const start = params.page === 1 ? 0 : 12;
    data = { anio_escolar_id: params.anio_escolar_id, fecha: params.fecha,
      secciones: authorized.slice(start, params.page === 1 ? 12 : undefined).map(seccion => {
        const empty = controls.missing || ['2', '3'].includes(seccion.id);
        return { seccion, es_lectivo: !['3', '4'].includes(seccion.id), situacion: empty ? 'SIN_REGISTRO' : 'ABIERTA',
          sesion_id: empty ? null : `1000${seccion.id}`, resumen: empty ? null
            : { total: 30, presentes: snapshot.account === '100' ? 20 : 10, tardanzas: 2, faltas: 3, pendientes: snapshot.account === '100' ? 5 : 15 } };
      }), pagination: { page: params.page, limit: params.limit, has_more: params.page === 1 } };
    if (controls.hold) await new Promise(resolve => controls.pending.push(resolve));
    if (snapshot.status) throw new AxiosError('Dato privado', '', config, null, { config, status: snapshot.status });
  } else {
    const response = await previous(config);
    if (response.data.user) response.data.user.id = controls.account;
    return response;
  }
  return { config, status: 200, headers: {}, data };
};
