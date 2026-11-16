import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { supervisionDetail, sessionId } from './support/supervisionDetailFixture.mjs';

let vite, http, api, Session, Auth;
const root = '/src/features/asistencias/supervision/';
const response = (config, data, status = 200) => ({ config, data, status, statusText: 'OK', headers: {} });
function updated(base, state) {
  const next = structuredClone(base), row = next.padron[0];
  row.estado = state; row.version++; next.sesion.version++;
  for (const [value, key] of [['PRESENTE', 'presentes'], ['TARDANZA', 'tardanzas'], ['FALTA', 'faltas'], ['PENDIENTE', 'pendientes']]) {
    next.resumen[key] = next.padron.filter(item => item.estado === value).length;
  }
  return next;
}
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  api = await vite.ssrLoadModule(`${root}supervisionCorrection.ts`);
  Session = (await vite.ssrLoadModule(`${root}SupervisionSessionDetail.tsx`)).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
});
after(async () => { await vite?.close(); });

test('corrección usa PATCH existente, IDs exactos y versiones de sesión/fila; estado y resumen confirmados', async () => {
  for (const state of ['TARDANZA', 'FALTA', 'PENDIENTE']) for (const closed of [false, true]) {
    const base = supervisionDetail(sessionId, closed ? 'CERRADA' : 'ABIERTA'), calls = [];
    http.httpClient.defaults.adapter = async config => {
      calls.push(config);
      assert.equal(config.method, 'patch'); assert.equal(config.url, `/asistencias/sesiones/${sessionId}/registros`);
      assert.deepEqual(JSON.parse(config.data), { version: 3, cambios: [{ asistencia_id: base.padron[0].asistencia_id,
        version: 1, estado: state, ...(closed ? { motivo: 'Llegada verificada' } : {}) }] });
      return response(config, updated(base, state));
    };
    const result = await api.saveSupervisionCorrection(base, base.padron[0].asistencia_id, state, '  Llegada verificada  ');
    assert.equal(result.padron[0].estado, state); assert.equal(result.sesion.version, 4);
    assert.equal(result.sesion.estado, base.sesion.estado); assert.equal(calls.length, 1);
    assert.equal(base.padron[0].estado, 'PRESENTE');
  }
});

test('validación rechaza estado inválido, misma marca o fila ajena; pendiente existente conserva versión cero', async () => {
  const base = supervisionDetail(); let calls = 0;
  http.httpClient.defaults.adapter = async config => { calls++; return response(config, base); };
  for (const [id, state] of [[base.padron[0].asistencia_id, 'PRESENTE'], [base.padron[0].asistencia_id, 'JUSTIFICADA'],
    [base.padron[0].asistencia_id, ''], ['999', 'FALTA']]) {
    await assert.rejects(api.saveSupervisionCorrection(base, id, state, ''));
  }
  assert.equal(calls, 0);
  assert.equal(api.correctionRequest(base, base.padron[3].asistencia_id, 'PRESENTE', '').cambios[0].version, 0);
});

test('motivo poscierre obligatorio, longitud por caracteres y Unicode válido; anulación previa es corregible', () => {
  const base = supervisionDetail(sessionId, 'CERRADA'), id = base.padron[0].asistencia_id;
  for (const reason of ['', '   ', 'a'.repeat(501), '\ud800', '\udc00']) {
    assert.throws(() => api.correctionRequest(base, id, 'FALTA', reason), /motivo/);
  }
  assert.equal(api.correctionRequest(base, id, 'FALTA', '😀'.repeat(500)).cambios[0].motivo, '😀'.repeat(500));
  base.padron[3].version = 2;
  assert.equal(api.correctionRequest(base, base.padron[3].asistencia_id, 'PRESENTE', 'Revisión').cambios[0].version, 2);
});

test('respuestas ajenas, versiones sin avance, estado no aplicado o resumen inconsistente no confirman guardado', async () => {
  const base = supervisionDetail(), id = base.padron[0].asistencia_id;
  for (const change of [result => { result.sesion.id = '2'; }, result => { result.sesion.version = 3; },
    result => { result.padron[0].version = 1; }, result => { result.padron[0].estado = 'PRESENTE'; },
    result => { result.resumen.faltas = 99; }, result => { result.padron[0].estado = 'OTRO'; },
    result => { result.padron.pop(); }, result => { result.sesion.estado = 'CERRADA'; }]) {
    http.httpClient.defaults.adapter = async config => { const result = updated(base, 'FALTA'); change(result); return response(config, result); };
    await assert.rejects(api.saveSupervisionCorrection(base, id, 'FALTA', ''));
  }
  http.httpClient.defaults.adapter = async config => response(config, updated(base, 'FALTA'), 202);
  await assert.rejects(api.saveSupervisionCorrection(base, id, 'FALTA', ''));
});

test('errores 400/403/404/409/500 y red se propagan sin reenviar ni consultar automáticamente', async () => {
  const base = supervisionDetail();
  for (const status of [400, 403, 404, 409, 500, undefined]) {
    let calls = 0;
    http.httpClient.defaults.adapter = async config => {
      calls++; throw new AxiosError('Detalle privado', '', config, null, status ? { config, status } : undefined);
    };
    await assert.rejects(api.saveSupervisionCorrection(base, base.padron[0].asistencia_id, 'FALTA', ''));
    assert.equal(calls, 1);
  }
});

test('matriz de asistencia orienta controles: ADMIN global, SUBDIRECCION por principal, REGISTRADOR sin corrección', () => {
  for (const [role, principal, allowed] of [['ADMIN', null, ['INICIAL', 'PRIMARIA', 'SECUNDARIA']],
    ['SUBDIRECCION', 'PRIMARIA', ['INICIAL', 'PRIMARIA']], ['SUBDIRECCION', 'SECUNDARIA', ['SECUNDARIA']],
    ['SUBDIRECCION', 'INICIAL', ['INICIAL']], ['REGISTRADOR', 'INICIAL', []]]) {
    for (const nivel of ['INICIAL', 'PRIMARIA', 'SECUNDARIA']) {
      const html = renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { rol: role, nivel_asignado: principal } } } },
        h(Session, { detail: { attendance: supervisionDetail(), section: { nivel, grado: 4, letra: 'A' } }, retry() {} })));
      assert.equal(html.includes('aria-label="Corrección de asistencia"'), allowed.includes(nivel), `${role}/${principal}/${nivel}`);
    }
  }
});

test('PATCH conserva señal y 401 invalida mediante cliente compartido', async () => {
  const signal = new AbortController().signal, expired = [], base = supervisionDetail();
  const disconnect = http.connectHttpSession({ current: () => ({ token: 'simulado', signal }), unauthorized: token => expired.push(token) });
  try {
    http.httpClient.defaults.adapter = async config => {
      assert.equal(config.signal, signal); assert.equal(config.headers.get('Authorization'), 'Bearer simulado');
      throw new AxiosError('Privado', '', config, null, { config, status: 401 });
    };
    await assert.rejects(api.saveSupervisionCorrection(base, base.padron[0].asistencia_id, 'FALTA', ''));
    assert.deepEqual(expired, ['simulado']);
  } finally { disconnect(); }
});
