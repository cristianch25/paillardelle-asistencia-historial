import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AxiosError } from 'axios';

let vite, http, dates, api, requests, List, Page, Selection, Auth, Selected, Sidebar, location;
const root = '/src/features/organizacion-escolar/secciones/';
const section = { id: '9007199254740993', anio_escolar_id: '1', nivel: 'INICIAL', grado: 4,
  letra: 'CREATIVOS', turno: null, activo: false };
const selected = { section, year: { id: '1', anio: 2026, estado: 'CERRADO' } };
const entry = { id: '9007199254740994', estudiante_id: '9007199254740995',
  matricula_seccion_id: '9007199254740996', estado: 'RETIRADA', estudiante: {
    id: '9007199254740995', apellido_paterno: 'Pérez', apellido_materno: null, nombres: 'Ana',
    codigo_estudiante: null, fecha_nacimiento: '2010-01-01', numero_documento: '12345678' } };
const result = { seccion: section, fecha: '2026-03-01', padron: [entry] };
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  dates = await vite.ssrLoadModule(`${root}padronDate.ts`);
  api = await vite.ssrLoadModule(`${root}padron.api.ts`);
  requests = await vite.ssrLoadModule(`${root}usePadron.ts`);
  List = (await vite.ssrLoadModule(`${root}EstudiantesList.tsx`)).default;
  Page = (await vite.ssrLoadModule(`${root}EstudiantesSeccionPage.tsx`)).default;
  Selected = (await vite.ssrLoadModule(`${root}SeccionSeleccionada.tsx`)).default;
  Sidebar = (await vite.ssrLoadModule('/src/app/layout/AppSidebar.tsx')).default;
  Selection = (await vite.ssrLoadModule(`${root}SeccionSelectionContext.ts`)).SeccionSelectionContext;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  location = await vite.ssrLoadModule(`${root}useSectionListLocation.ts`);
});
after(async () => { await vite?.close(); });

function markup(Component, { role = 'ADMIN', selection = selected, checking = false, error = '',
  path = '/secciones/estudiantes?page=3&nivel=INICIAL' } = {}) {
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [path] },
    h(Auth.Provider, { value: { session: { user: { rol: role } } } },
      h(Selection.Provider, { value: { selected: selection, checking, error, revalidate: async () => {}, clear() {} } },
        h(Component)))));
}

test('fecha peruana conserva día civil aunque UTC ya esté en el siguiente día', () => {
  assert.equal(dates.peruToday(new Date('2026-11-16T02:30:00Z')), '2026-11-15');
  assert.equal(dates.peruToday(new Date('2026-11-16T05:00:00Z')), '2026-11-16');
  for (const date of ['1000-01-01', '9999-12-31', '2024-02-29', '2026-03-01', '2027-01-02']) {
    assert.equal(dates.validPadronDate(date), true, date);
  }
  for (const date of ['', '2026-1-01', '2026-02-29', '2026-02-30', '2026-13-01', '0999-12-31', '2026-03-01T00:00:00Z']) {
    assert.equal(dates.validPadronDate(date), false, date);
  }
});

test('padrón usa un GET con fecha explícita, IDs exactos y sin listados complementarios', async () => {
  const paths = [];
  http.httpClient.defaults.adapter = async config => {
    paths.push(config.url);
    assert.equal(config.method, 'get');
    assert.deepEqual(config.params, { fecha: result.fecha });
    return response(config, result);
  };
  assert.deepEqual(await api.getPadron(section.id, result.fecha), result);
  assert.deepEqual(paths, [`/secciones/${section.id}/padron`]);
});

test('lista respeta orden, apellidos nulos y nombres largos sin exponer otros datos personales', () => {
  const second = { ...entry, estudiante_id: '2', matricula_seccion_id: '3', estudiante: {
    ...entry.estudiante, apellido_paterno: 'Álvarez', apellido_materno: 'Del Río',
    nombres: 'Nombre largo '.repeat(20), codigo_estudiante: '000123' } };
  const html = renderToStaticMarkup(h(List, { entries: [entry, second] }));
  assert.ok(html.indexOf('Pérez Ana') < html.indexOf('Álvarez Del Río'));
  assert.ok(html.includes(second.estudiante.nombres));
  assert.match(html, /2 estudiantes en esta fecha/);
  assert.match(html, /Código: 000123/);
  assert.doesNotMatch(html, /null|2010-01-01|12345678|RETIRADA|<ol|asistencia/i);
});

test('vacío y duplicados tienen mensajes distintos; nunca cuentan vínculos como personas diferentes', () => {
  const empty = renderToStaticMarkup(h(List, { entries: [] }));
  assert.match(empty, /No hay estudiantes matriculados/);
  assert.match(empty, /0 estudiantes en esta fecha/);
  const html = renderToStaticMarkup(h(List, { entries: [entry, { ...entry, matricula_seccion_id: '9' }] }));
  assert.match(html, /vínculos duplicados/);
  assert.doesNotMatch(html, /2 estudiantes|Pérez Ana/);
});

test('tres roles ven fecha sin límites de calendario y regreso según rol con filtros/página', () => {
  for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    const html = markup(Page, { role });
    assert.match(html, /Estudiantes de la sección/);
    assert.match(html, /Fecha de consulta/);
    assert.match(html, /4 años · CREATIVOS/);
    assert.match(html, /Año escolar 2026/);
    assert.ok(html.includes(role === 'REGISTRADOR' ? 'Volver a mis secciones' : 'Volver a secciones'));
    assert.match(html, /<button[^>]*class="[^"]*bg-white[^"]*"[^>]*><svg[^>]*aria-hidden="true"/);
    assert.match(html, /lucide-arrow-left/);
    assert.doesNotMatch(html, / min=| max=|Turno:|Guardar|Cerrar sesión de asistencia/);
  }
  assert.match(markup(Selected), /href="\/secciones\/estudiantes\?page=3&amp;nivel=INICIAL"[^>]*>Ver estudiantes/);
});

test('menú mantiene secciones activo en rutas hijas por segmento, para los tres roles', () => {
  for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    for (const path of ['/secciones', '/secciones/', '/secciones/estudiantes?page=3', '/secciones/otra']) {
      const html = markup(Sidebar, { role, path });
      assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/secciones"/);
      assert.ok(html.includes(role === 'REGISTRADOR' ? 'Mis secciones' : 'Secciones'));
      assert.doesNotMatch(html, /href="\/secciones\/estudiantes"/);
    }
    for (const path of ['/secciones-ajenas', '/secciones2', '/otra/secciones', '/inicio']) {
      const html = markup(Sidebar, { role, path });
      const link = html.match(/<a[^>]*href="\/secciones"[^>]*>/)[0];
      assert.doesNotMatch(link, /aria-current/);
    }
  }
});

test('acceso directo sin selección y revalidación no muestran datos anteriores', () => {
  assert.match(markup(Page, { selection: null }), /Selecciona una sección/);
  const html = markup(Page, { checking: true });
  assert.match(html, /Comprobando la sección/);
  assert.doesNotMatch(html, /CREATIVOS|Fecha de consulta|Pérez|estudiantes en esta fecha/);
});

test('filtros y página se recuperan de la URL sin inferir autorizaciones', () => {
  assert.deepEqual(location.readSectionListLocation(new URLSearchParams(
    'anio_escolar_id=9007199254740993&nivel=INICIAL&grado=4&activo=false&page=3')), {
    yearId: '9007199254740993', filters: { nivel: 'INICIAL', grado: '4', activo: 'false' }, page: 3,
  });
  for (const page of ['0', '-2', '1.5', 'Infinity', '9007199254740993']) {
    assert.equal(location.readSectionListLocation(new URLSearchParams({ page })).page, 1);
  }
});

test('errores 400/403/404 y red conservan su significado sin convertirse en listas vacías', async () => {
  for (const [status, expected] of [[400, /fecha completa y válida/], [403, /No tienes permiso para realizar esta acción\./],
    [404, /no está disponible o no tienes permiso/], [500, /No se pudo completar/], [undefined, /Comprueba tu conexión/]]) {
    http.httpClient.defaults.adapter = async config => {
      throw new AxiosError('detalle interno', 'ERR_BAD_REQUEST', config, undefined, status ? { status, config } : undefined);
    };
    const values = [];
    requests.observePadron(section.id, result.fecha, value => values.push(value));
    await setImmediate();
    assert.equal(values.length, 1);
    assert.equal(values[0].data, null);
    assert.match(values[0].error, expected);
    assert.doesNotMatch(values[0].error, /detalle interno/);
  }
});

test('401 de padrón mantiene señal y tratamiento global de sesión', async () => {
  const controller = new AbortController();
  const invalidated = [];
  const disconnect = http.connectHttpSession({ current: () => ({ token: 'ficticio', signal: controller.signal }),
    unauthorized: token => invalidated.push(token) });
  try {
    http.httpClient.defaults.adapter = async config => {
      assert.equal(config.signal, controller.signal);
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, undefined, { status: 401, config });
    };
    await assert.rejects(api.getPadron(section.id, result.fecha));
    assert.deepEqual(invalidated, ['ficticio']);
  } finally { disconnect(); }
});

test('invalidación de solicitudes descarta respuestas y errores tardíos y conserva solo la consulta vigente', async () => {
  const pending = [];
  http.httpClient.defaults.adapter = config => new Promise((resolve, reject) => pending.push({ config, resolve, reject }));
  const values = [];
  const stop = requests.observePadron(section.id, '2026-03-01', value => values.push(value));
  await setImmediate();
  stop();
  requests.observePadron('2', '2026-03-02', value => values.push(value));
  await setImmediate();
  pending[1].resolve(response(pending[1].config, { ...result, fecha: '2026-03-02', padron: [] }));
  await setImmediate();
  pending[0].resolve(response(pending[0].config, result));
  await setImmediate();
  assert.equal(values.length, 1);
  assert.deepEqual(values[0].data.padron, []);
  const stopError = requests.observePadron('3', result.fecha, value => values.push(value));
  await setImmediate();
  stopError();
  pending[2].reject(new Error('respuesta antigua'));
  await setImmediate();
  assert.equal(values.length, 1);
});
