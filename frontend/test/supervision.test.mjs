import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router';
import { supervisionResult, year } from './support/supervisionFixture.mjs';

let vite, http, api, access, query, Page, Auth, navigation, Workspace, dates, validation;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  const root = '/src/features/asistencias/supervision/';
  api = await vite.ssrLoadModule(`${root}supervision.api.ts`);
  access = await vite.ssrLoadModule(`${root}supervisionAccess.ts`);
  query = await vite.ssrLoadModule(`${root}useSupervisionQuery.ts`);
  Page = (await vite.ssrLoadModule(`${root}SupervisionPage.tsx`)).default;
  Workspace = (await vite.ssrLoadModule(`${root}SupervisionWorkspace.tsx`)).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  navigation = await vite.ssrLoadModule('/src/app/layout/navigation.ts');
  dates = await vite.ssrLoadModule('/src/shared/dates/civilDate.ts');
  validation = await vite.ssrLoadModule(`${root}supervisionDate.ts`);
});
after(async () => { await vite?.close(); });

test('fecha de supervisión: calendario civil, límites inclusivos y consultas de cualquier estado de año', () => {
  for (const fecha of ['', '2026-02-29', '2026-02-30', '2026-13-01', '2026-04-31', '15/11/2026']) {
    assert.match(validation.supervisionDateError(fecha, year), /fecha válida/);
  }
  for (const estado of ['PLANIFICADO', 'ABIERTO', 'CERRADO']) {
    for (const fecha of ['2026-01-01', '2026-11-15', '2026-12-31']) {
      assert.equal(validation.supervisionDateError(fecha, { ...year, estado }), '');
    }
  }
  for (const fecha of ['2025-12-31', '2027-01-01']) {
    assert.match(validation.supervisionDateError(fecha, year), /entre el 01\/01\/2026 y el 31\/12\/2026/);
  }
  assert.equal(validation.supervisionDateError('2024-02-29', { ...year, fecha_inicio: '2024-02-01', fecha_fin: '2024-03-01' }), '');
  assert.match(validation.supervisionDateError('2100-02-29'), /fecha válida/);
  assert.equal(validation.supervisionDateError('2000-02-29'), '');
  assert.equal(dates.peruToday(new Date('2026-11-17T04:59:59Z')), '2026-11-16');
  assert.equal(dates.peruToday(new Date('2026-11-17T05:00:00Z')), '2026-11-17');
});

test('GET conserva parámetros, IDs BIGINT, null y resumen del contrato sin mutaciones', async () => {
  const requests = [];
  const cases = [
    { anio_escolar_id: year.id, fecha: '2026-11-15' },
    { anio_escolar_id: year.id, fecha: '2026-11-16', nivel: 'INICIAL', seccion_id: '9007199254740995', page: 2, limit: 20 },
  ];
  for (const params of cases) {
    for (const withSession of [false, true]) {
      const data = supervisionResult(params);
      if (withSession) Object.assign(data.secciones[0], { situacion: 'CERRADA', sesion_id: '9007199254740999',
        resumen: { total: 3, presentes: 1, faltas: 1, tardanzas: 0, pendientes: 1 } });
      http.httpClient.defaults.adapter = async config => {
        requests.push(config); assert.equal(config.url, '/asistencias/sesiones');
        assert.deepEqual(config.params, params); assert.equal(config.data, undefined);
        return { config, data, status: 200, statusText: 'OK', headers: {} };
      };
      assert.deepEqual(await api.getAttendanceSupervision(params), data);
    }
  }
  assert.ok(requests.every(request => request.method === 'get'));
});

test('400/401/403/404 y red rechazan y producen mensajes seguros, nunca una lista vacía', async () => {
  for (const [status, pattern] of [[400, /Revisa los filtros/], [401, /sesión ya no es válida/],
    [403, /No tienes permiso/], [404, /no están disponibles/], [undefined, /conectar con el servidor/]]) {
    http.httpClient.defaults.adapter = async config => {
      throw new AxiosError('secreto interno', '', config, null, status ? { config, status } : undefined);
    };
    await assert.rejects(api.getAttendanceSupervision({ anio_escolar_id: year.id, fecha: '2026-11-15' }), error => {
      assert.match(query.supervisionError(error), pattern);
      assert.doesNotMatch(query.supervisionError(error), /secreto/); return true;
    });
  }
});

test('401 conserva Bearer y señal compartida para invalidar la sesión', async () => {
  const signal = new AbortController().signal, expired = [];
  const disconnect = http.connectHttpSession({ current: () => ({ token: 'simulado', signal }), unauthorized: token => expired.push(token) });
  try {
    http.httpClient.defaults.adapter = async config => {
      assert.equal(config.signal, signal); assert.equal(config.headers.get('Authorization'), 'Bearer simulado');
      throw new AxiosError('401', '', config, null, { config, status: 401 });
    };
    await assert.rejects(api.getAttendanceSupervision({ anio_escolar_id: year.id, fecha: '2026-11-15' }));
    assert.deepEqual(expired, ['simulado']);
  } finally { disconnect(); }
});

test('matriz específica y navegación solo ADMIN/SUBDIRECCION; pantalla sin proveedor de selección', () => {
  for (const [rol, nivel_asignado, levels] of [['ADMIN', null, ['INICIAL', 'PRIMARIA', 'SECUNDARIA']],
    ['SUBDIRECCION', 'PRIMARIA', ['INICIAL', 'PRIMARIA']], ['SUBDIRECCION', 'SECUNDARIA', ['SECUNDARIA']],
    ['SUBDIRECCION', 'INICIAL', ['INICIAL']], ['REGISTRADOR', 'PRIMARIA', []]]) {
    const user = { id: '1', rol, nivel_asignado };
    assert.deepEqual(access.supervisionLevels(user), levels);
    assert.equal(navigation.navigationFor(rol).some(item => item.path === '/asistencias/supervision'), rol !== 'REGISTRADOR');
    const html = renderToStaticMarkup(h(MemoryRouter, null, h(Auth.Provider, { value: { session: { user } } },
      h(Routes, null, h(Route, { element: h(Workspace) }, h(Route, { path: '/', element: h(Page) }))))));
    assert.equal(html.includes('>Asistencias<'), rol !== 'REGISTRADOR');
  }
});
