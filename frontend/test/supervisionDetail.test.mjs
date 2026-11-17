import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sessionId, sectionId, supervisionDetail } from './support/supervisionDetailFixture.mjs';
import { supervisionResult } from './support/supervisionFixture.mjs';

let vite, http, api, dates, Students, Session;
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  api = await vite.ssrLoadModule('/src/features/asistencias/supervision/supervisionDetail.api.ts');
  dates = await vite.ssrLoadModule('/src/shared/dates/civilDate.ts');
  Students = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionStudents.tsx')).default;
  Session = (await vite.ssrLoadModule('/src/features/asistencias/supervision/SupervisionSessionDetail.tsx')).default;
});
after(async () => { await vite?.close(); });

test('detalle de lectura no requiere contexto de edición ni autenticación y omite auditoría técnica', () => {
  for (const state of ['ABIERTA', 'CERRADA']) {
    const attendance = supervisionDetail(sessionId, state);
    attendance.padron[0].ultimo_cambio = { usuario_id: 'ACTOR_TECNICO_OCULTO', fecha: 'INSTANTE_TECNICO_OCULTO' };
    const html = renderToStaticMarkup(h(Session, { editable: false,
      detail: { attendance, section: { nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' } }, retry() {} }));
    assert.match(html, /Detalle por estudiante/);
    assert.match(html, /Totales de asistencia/);
    assert.match(html, state === 'ABIERTA' ? /Sesión abierta/ : /Sesión cerrada/);
    assert.doesNotMatch(html, /Corrección de asistencia|Guardar cambios|Cerrar asistencia|ACTOR_TECNICO_OCULTO|INSTANTE_TECNICO_OCULTO/);
    assert.doesNotMatch(html, /aria-label="Asistencia de/);
  }
});

test('fecha civil se presenta DD/MM/AAAA sin conversión horaria ni modificación del valor original', () => {
  for (const [raw, formatted] of [['2026-11-15', '15/11/2026'], ['2026-01-02', '02/01/2026'], ['2024-02-29', '29/02/2024']]) {
    assert.equal(dates.formatCivilDate(raw), formatted);
    assert.equal(dates.validCivilDate(raw), true);
  }
  assert.equal(dates.formatCivilDate('2026-02-30'), '2026-02-30');
});

test('contador distingue 0 estudiantes, 1 estudiante y varios estudiantes', () => {
  const { padron } = supervisionDetail();
  for (const count of [0, 1, 5]) {
    const html = renderToStaticMarkup(h(Students, { padron: padron.slice(0, count) }));
    assert.match(html, new RegExp(`>${count} ${count === 1 ? 'estudiante' : 'estudiantes'} · Todos<`));
  }
});

test('detalle ABIERTA/CERRADA usa sesion_id y resuelve identidad con un GET acotado de asistencia', async () => {
  for (const state of ['ABIERTA', 'CERRADA']) {
    const attendance = supervisionDetail(sessionId, state), calls = [];
    http.httpClient.defaults.adapter = async config => {
      calls.push(config); assert.equal(config.method, 'get'); assert.equal(config.data, undefined);
      if (calls.length === 1) {
        assert.equal(config.url, `/asistencias/sesiones/${sessionId}`); assert.notEqual(sessionId, sectionId);
        assert.equal(config.params, undefined); return response(config, attendance);
      }
      assert.equal(config.url, '/asistencias/sesiones');
      assert.deepEqual(config.params, { anio_escolar_id: attendance.sesion.anio_escolar_id,
        fecha: attendance.sesion.fecha, seccion_id: sectionId, page: 1, limit: 1 });
      const data = supervisionResult(config.params); data.secciones[0].sesion_id = sessionId;
      return response(config, data);
    };
    const result = await api.getSupervisionDetail(sessionId, () => true);
    assert.deepEqual(result.attendance, attendance); assert.equal(result.section.id, sectionId); assert.equal(calls.length, 2);
    assert.deepEqual(new Set(result.attendance.padron.map(row => row.estado)), new Set(['PRESENTE', 'TARDANZA', 'FALTA', 'PENDIENTE']));
  }
});

test('403/404/red de detalle o identidad rechazan todo sin entregar padrón parcial', async () => {
  for (const failedStep of [1, 2]) for (const status of [403, 404, undefined]) {
    let calls = 0;
    http.httpClient.defaults.adapter = async config => {
      calls++; if (calls === failedStep) throw new AxiosError('privado', '', config, null, status ? { config, status } : undefined);
      return response(config, supervisionDetail());
    };
    await assert.rejects(api.getSupervisionDetail(sessionId, () => true)); assert.equal(calls, failedStep);
  }
});

test('invalidación no consulta identidad ni publica respuestas antiguas; ID inválido no genera HTTP', async () => {
  let current = false, count = 0;
  http.httpClient.defaults.adapter = async config => { count++; current = false; return response(config, supervisionDetail()); };
  assert.equal(await api.getSupervisionDetail(sessionId, () => current), null); assert.equal(count, 0);
  current = true; assert.equal(await api.getSupervisionDetail(sessionId, () => current), null); assert.equal(count, 1);
  for (const id of ['no-valido', '../sesiones', '18446744073709551616']) await assert.rejects(api.getSupervisionDetail(id, () => true));
  assert.equal(count, 1);
});

test('respuesta de otra sesión o identidad incompatible nunca se entrega como detalle', async () => {
  http.httpClient.defaults.adapter = async config => response(config, supervisionDetail('2'));
  await assert.rejects(api.getSupervisionDetail(sessionId, () => true));
  http.httpClient.defaults.adapter = async config => response(config, config.params ? supervisionResult(config.params) : supervisionDetail());
  await assert.rejects(api.getSupervisionDetail(sessionId, () => true));
});

test('401 conserva señal/Bearer para invalidación global también en el GET de identidad', async () => {
  for (const failedStep of [1, 2]) {
    const signal = new AbortController().signal, expired = []; let calls = 0;
    const disconnect = http.connectHttpSession({ current: () => ({ token: 'simulado', signal }), unauthorized: token => expired.push(token) });
    try {
      http.httpClient.defaults.adapter = async config => {
        calls++; assert.equal(config.signal, signal); assert.equal(config.headers.get('Authorization'), 'Bearer simulado');
        if (calls === failedStep) throw new AxiosError('401', '', config, null, { config, status: 401 });
        return response(config, supervisionDetail());
      };
      await assert.rejects(api.getSupervisionDetail(sessionId, () => true)); assert.deepEqual(expired, ['simulado']);
    } finally { disconnect(); }
  }
});
