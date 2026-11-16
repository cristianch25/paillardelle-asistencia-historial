import './sectionSearchHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { sectionCatalog } from './sectionSearchFixture.mjs';

const previous = httpClient.defaults.adapter;
const years = [
  { id: '1', anio: 2026, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', estado: 'ABIERTO' },
  { id: '2', anio: 2001, fecha_inicio: '2001-03-01', fecha_fin: '2001-12-15', estado: 'CERRADO' },
  { id: '3', anio: 2199, fecha_inicio: '2199-03-01', fecha_fin: '2199-12-15', estado: 'PLANIFICADO' },
];
const controls = { calls: [], count: 1, failPage: 0, status: 'network', holdPage: 0, pending: [],
  padronEmpty: false, padronStatus: null, invalid: false, years };
window.sectionStudentsTest = controls;
httpClient.defaults.adapter = async config => {
  const fail = status => { throw new AxiosError('Detalle privado', '', config, null,
    status === 'network' ? undefined : { status, config }); };
  if (config.url === '/anios-escolares') return { config, status: 200, headers: {}, data: {
    anios_escolares: years, pagination: { page: 1, limit: 100, has_more: false } } };
  if (config.url === '/asignaciones') {
    controls.calls.push({ url: config.url, params: config.params, method: config.method });
    const { page, limit, seccion_id, anio_escolar_id } = config.params;
    const year = years.find(item => item.id === anio_escolar_id);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const date = today < year.fecha_inicio ? year.fecha_inicio : today > year.fecha_fin ? year.fecha_fin : today;
    const rows = Array.from({ length: controls.count }, (_, index) => ({ id: String(index + 1), usuario_id: String(index + 10),
      seccion_id, fecha_inicio: date, fecha_fin: index % 2 ? date : null,
      usuario: { nombres: `Lucía ${index + 1}`, apellidos: 'Rojas Vega', cargo: index % 2 ? 'AUXILIAR' : null } }));
    rows.push({ id: '9999', usuario_id: '9999', seccion_id, fecha_inicio: '2200-01-01', fecha_fin: null,
      usuario: { nombres: 'Futura oculta', apellidos: 'Prueba', cargo: null } },
    { id: '9998', usuario_id: '9998', seccion_id, fecha_inicio: '2000-01-01', fecha_fin: '2000-12-31',
      usuario: { nombres: 'Anterior oculta', apellidos: 'Prueba', cargo: null } });
    const result = { config, status: 200, headers: {}, data: { asignaciones: rows.slice((page - 1) * limit, page * limit),
      pagination: { page: controls.invalid ? 0 : page, limit, has_more: page * limit < rows.length } } };
    const status = controls.failPage === page ? controls.status : null;
    if (controls.holdPage === page) await new Promise(resolve => controls.pending.push(resolve));
    if (status) fail(status);
    return result;
  }
  if (config.url.endsWith('/padron')) {
    controls.calls.push({ url: config.url, params: config.params, method: config.method });
    if (controls.padronStatus) fail(controls.padronStatus);
    const result = await previous(config);
    const id = config.url.split('/')[2];
    result.data.seccion = sectionCatalog().find(row => row.id === id);
    if (controls.padronEmpty) result.data.padron = [];
    return result;
  }
  return previous(config);
};
