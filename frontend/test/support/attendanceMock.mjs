import { AxiosError } from 'axios';
import { data, selection } from './attendanceFixture.mjs';

export function attendanceMock() {
  const controls = { calls: [], prompts: [], confirmAnswer: true, holdSections: false, allow: true, release: null,
    sessionState: 'ABIERTA', sessionCreated: false, account: '5', server: structuredClone(data), extraSections: [], sectionStatus: null, saveStatus: null, readStatus: null,
    calendar: { es_lectivo: true, origen: 'REGLA_SEMANAL', descripcion: null },
    closeStatus: null, applyCloseBeforeError: false, holdClose: false, releaseClose: null,
    applyBeforeError: false, holdPatch: false, releasePatch: null, holdRead: false, releaseRead: null, sessionAllowed: true };
  function summary() {
    const count = state => controls.server.padron.filter(row => row.estado === state).length;
    controls.server.resumen = { total: controls.server.padron.length, presentes: count('PRESENTE'),
      tardanzas: count('TARDANZA'), faltas: count('FALTA'), pendientes: count('PENDIENTE') };
  }
  controls.reset = () => Object.assign(controls, { calls: [], server: structuredClone(data), extraSections: [],
    account: String(Number(controls.account ?? '5') + 1), sessionState: 'ABIERTA', sessionCreated: false, confirmAnswer: true,
    calendar: { es_lectivo: true, origen: 'REGLA_SEMANAL', descripcion: null },
    closeStatus: null, applyCloseBeforeError: false, holdClose: false, releaseClose: null,
    holdSections: false, allow: true, sectionStatus: null, saveStatus: null, readStatus: null, applyBeforeError: false,
    holdPatch: false, holdRead: false, releasePatch: null, releaseRead: null, sessionAllowed: true });
  controls.summary = summary;
  controls.externalMark = (index, state) => {
    Object.assign(controls.server.padron[index], { estado: state, version: controls.server.padron[index].version + 1 });
    controls.server.sesion.version++; summary();
  };
  function apply(body) {
    if (body.version !== controls.server.sesion.version || body.cambios.some(change =>
      controls.server.padron.find(row => row.asistencia_id === change.asistencia_id)?.version !== change.version)) return 409;
    if (controls.sessionState === 'CERRADA') return 400;
    for (const change of body.cambios) {
      const row = controls.server.padron.find(row => row.asistencia_id === change.asistencia_id);
      if (row.estado !== change.estado) Object.assign(row, { estado: change.estado, version: row.version + 1 });
    }
    controls.server.sesion.version++; summary(); return 200;
  }
  async function adapter(config) {
    const body = config.data ? JSON.parse(config.data) : undefined;
    controls.calls.push({ method: config.method, url: config.url, body });
    const fail = (status, code = '') => { throw new AxiosError('Detalle interno que no debe mostrarse', code, config, null,
      status ? { config, status, data: { error: 'Mensaje privado simulado' } } : undefined); };
    let result;
    if (config.url === '/secciones/') {
      if (controls.sectionStatus) fail(controls.sectionStatus === 'network' ? undefined : controls.sectionStatus);
      if (controls.holdSections) await new Promise(resolve => { controls.release = resolve; });
      result = { secciones: controls.allow ? [structuredClone(selection.section), ...structuredClone(controls.extraSections)] : [],
        pagination: { page: 1, limit: 100, has_more: false } };
    } else if (config.url === '/calendario-lectivo') {
      result = { ...config.params, dias: [{ fecha: config.params.desde, ...controls.calendar }] };
    } else if (/^\/secciones\/\d+\/padron$/.test(config.url)) {
      const sectionId = config.url.split('/')[2];
      result = { seccion: { ...selection.section, id: sectionId }, fecha: config.params.fecha,
        padron: controls.server.padron.map(row => ({ id: row.matricula_id, estudiante_id: row.estudiante.id,
          anio_escolar_id: '1', matricula_seccion_id: row.matricula_seccion_id, seccion_id: sectionId,
          fecha_ingreso: '2026-03-02', fecha_retiro: null, estado: 'ACTIVA', fecha_inicio: '2026-03-02', fecha_fin: null,
          estudiante: { ...row.estudiante, tipo_documento: null, numero_documento: null, fecha_nacimiento: null,
            created_at: '2026-03-02 12:00:00', updated_at: '2026-03-02 12:00:00' } })) };
    } else if (config.url.startsWith('/asistencias/sesiones')) {
      if (!controls.sessionAllowed) fail(404);
      if (config.url.endsWith('/cierre') && config.method === 'post') {
        if (controls.holdClose) await new Promise(resolve => { controls.releaseClose = resolve; });
        if (!controls.closeStatus || controls.applyCloseBeforeError) {
          if (Object.keys(body).length !== 1 || body.version !== controls.server.sesion.version) fail(409);
          if (controls.sessionState !== 'CERRADA') {
            controls.sessionState = 'CERRADA'; controls.server.sesion.version++;
          }
        }
        if (controls.closeStatus) fail(['network', 'timeout'].includes(controls.closeStatus) ? undefined : controls.closeStatus,
          controls.closeStatus === 'timeout' ? 'ECONNABORTED' : '');
      } else if (config.method === 'patch') {
        if (controls.holdPatch) await new Promise(resolve => { controls.releasePatch = resolve; });
        if (!controls.saveStatus || controls.applyBeforeError) { const status = apply(body); if (status !== 200) fail(status); }
        if (controls.saveStatus) fail(['network', 'timeout'].includes(controls.saveStatus) ? undefined : controls.saveStatus,
          controls.saveStatus === 'timeout' ? 'ECONNABORTED' : '');
      } else if (config.method === 'get') {
        if (controls.holdRead) await new Promise(resolve => { controls.releaseRead = resolve; });
        if (controls.readStatus) fail(controls.readStatus);
      }
      result = { ...structuredClone(controls.server), sesion: { ...controls.server.sesion, estado: controls.sessionState },
        ...(config.method === 'post' && !config.url.endsWith('/cierre') ? { creada: controls.sessionCreated } : {}),
        ...(config.url.endsWith('/cierre') ? { advertencias: controls.server.resumen.pendientes
          ? [{ codigo: 'PENDIENTES_AL_CERRAR', cantidad: controls.server.resumen.pendientes }] : [] } : {}) };
    } else throw new Error(`Solicitud inesperada: ${config.method} ${config.url}`);
    const status = result.creada ? 201 : 200;
    if (result.creada) controls.sessionCreated = false;
    return { config, status, statusText: 'OK', headers: {}, data: result };
  }
  return { controls, adapter };
}
