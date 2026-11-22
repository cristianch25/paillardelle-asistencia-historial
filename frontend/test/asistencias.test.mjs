import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createServer } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AxiosError } from 'axios';

let vite, http, api, calendarApi, opening, calendar, Page, View, CalendarDayInfo, Auth, Selection, Selected;
const root = '/src/features/asistencias/';
const selection = { section: { id: '9007199254740993', anio_escolar_id: '1', nivel: 'INICIAL', grado: 4,
  letra: 'CREATIVOS', activo: false, turno: null }, year: { id: '1', anio: 2026, estado: 'CERRADO' } };
const data = { creada: false, sesion: { id: '9007199254740994', seccion_id: selection.section.id,
  anio_escolar_id: '1', fecha: '2026-11-13', estado: 'CERRADA', version: 7 },
padron: [{ asistencia_id: '9007199254740995', matricula_id: '9007199254740996', matricula_seccion_id: '9007199254740997',
  version: 0, estado: 'PENDIENTE', ultimo_cambio: null,
  estudiante: { id: '9007199254740998', apellido_paterno: 'Pérez', apellido_materno: null, nombres: 'Ana', codigo_estudiante: null } }],
resumen: { total: 1, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 1 } };
const response = (config, value) => ({ config, data: value, status: 200, statusText: 'OK', headers: {} });
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  http = await vite.ssrLoadModule('/src/shared/api/httpClient.ts');
  api = await vite.ssrLoadModule(`${root}asistencias.api.ts`);
  calendarApi = await vite.ssrLoadModule('/src/features/organizacion-escolar/calendario-lectivo/calendario.api.ts');
  opening = await vite.ssrLoadModule(`${root}useAsistenciaSession.ts`);
  calendar = await vite.ssrLoadModule(`${root}useAttendanceCalendar.ts`);
  Page = (await vite.ssrLoadModule(`${root}AsistenciaDiariaPage.tsx`)).default;
  View = (await vite.ssrLoadModule(`${root}AsistenciaSessionView.tsx`)).default;
  CalendarDayInfo = (await vite.ssrLoadModule(`${root}AttendanceCalendarInfo.tsx`)).CalendarDayInfo;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  Selection = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/SeccionSelectionContext.ts')).SeccionSelectionContext;
  Selected = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/SeccionSeleccionada.tsx')).default;
});
after(async () => { await vite?.close(); });

function markup(Component = Page, { role = 'ADMIN', selected = selection, checking = false, state, workDate } = {}) {
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [{ pathname: '/secciones/asistencia', search: '?page=3', state }] },
    h(Auth.Provider, { value: { session: { user: { rol: role } } } },
      h(Selection.Provider, { value: { selected, checking, error: '', attendanceDate: workDate ?? state?.fecha ?? '2026-11-13',
        revalidate: async () => {}, clear() {} } }, h(Component)))));
}

test('pantalla inicia sin POST y ofrece una apertura explícita a los tres roles; no bloquea recuperación por año cerrado/sección inactiva', async () => {
  let calls = 0;
  http.httpClient.defaults.adapter = async config => { calls++; return response(config, data); };
  for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    const html = markup(Page, { role, state: { fecha: '2026-11-13' } });
    assert.match(html, role === 'REGISTRADOR' ? /<h1[^>]*>4 años CREATIVOS/ : /<h1[^>]*>Asistencia diaria/);
    if (role === 'REGISTRADOR') assert.doesNotMatch(html, /Asistencia del|type="date"/);
    else assert.match(html, /value="2026-11-13"/);
    const button = html.match(/<button[^>]*>Abrir asistencia<\/button>/)?.[0];
    if (role === 'REGISTRADOR') { assert.equal(button, undefined); assert.doesNotMatch(html, /Detalles|Detalle de sección/); }
    else { assert.ok(button); assert.doesNotMatch(button, /\sdisabled(?:=|[\s>])/); }
    assert.match(html, role === 'REGISTRADOR' ? /Volver<\/button>/ : /Volver a secciones/);
    assert.doesNotMatch(html, /<select|Guardar|Cerrar asistencia|Corregir|Justificar| min=| max=/);
  }
  await setImmediate();
  assert.equal(calls, 0, 'renderizar no inicia la apertura');
  assert.match(markup(Selected), /href="\/secciones\/asistencia\?page=3"[^>]*>Asistencia diaria/);
});

test('REGISTRADOR usa la fecha compartida y ADMIN/SUBDIRECCION conservan su selector local', () => {
  const state = { fecha: '2026-11-13' }, workDate = '2026-10-01';
  const html = markup(Page, { role: 'REGISTRADOR', state, workDate });
  assert.doesNotMatch(html, /Asistencia del|type="date"|13\/11\/2026/);
  for (const role of ['ADMIN', 'SUBDIRECCION']) {
    assert.match(markup(Page, { role, state, workDate }), /type="date"[^>]*value="2026-11-13"/);
  }
});

test('filas compactas conservan controles, buscador y masivo sin perfil ni instrucciones repetidas', () => {
  const render = compact => renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { rol: 'REGISTRADOR', id: '5' } } } },
    h(View, { data, editable: true, compact })));
  const compact = render(true);
  assert.match(compact, /Buscar estudiante|Marcar todos como presentes/);
  assert.equal((compact.match(/aria-pressed=/g) ?? []).length, 3);
  assert.doesNotMatch(compact, /Quitar marca/);
  assert.equal((render(false).match(/aria-pressed=/g) ?? []).length, 4);
  assert.doesNotMatch(compact, /Ver perfil|Las marcas se guardan solo|Se aplica a los estudiantes/);
  assert.match(render(false), /Ver perfil|Las marcas se guardan solo/);
});

test('sin selección o durante revalidación no expone la sesión ni ofrece apertura', () => {
  assert.match(markup(Page, { selected: null }), /Selecciona una sección/);
  const html = markup(Page, { checking: true });
  assert.match(html, /Comprobando la sección/);
  assert.doesNotMatch(html, /Abrir asistencia|CREATIVOS|Pérez/);
});

test('fecha transferida inválida se sustituye por una fecha civil válida', () => {
  const html = markup(Page, { state: { fecha: '2026-02-30' } });
  assert.doesNotMatch(html, /value="2026-02-30"/);
  assert.match(html, /type="date"[^>]*value="\d{4}-\d{2}-\d{2}"/);
});

test('apertura y recuperación conservan el sobre, IDs y versiones; solo usan el POST real', async () => {
  const calls = [];
  for (const creada of [true, false]) {
    http.httpClient.defaults.adapter = async config => {
      calls.push(config.url);
      assert.equal(config.method, 'post');
      assert.deepEqual(JSON.parse(config.data), { seccion_id: selection.section.id, fecha: '2026-11-13' });
      return { ...response(config, { ...data, creada }), status: creada ? 201 : 200 };
    };
    const result = await api.openAttendance(selection.section.id, '2026-11-13');
    assert.equal(result.creada, creada);
    assert.equal(result.padron[0].asistencia_id, '9007199254740995');
    assert.equal(result.sesion.version, 7);
    assert.equal(result.padron[0].version, 0);
  }
  assert.deepEqual(calls, ['/asistencias/sesiones', '/asistencias/sesiones']);
});

test('consulta calendario efectivo de un único día con año/nivel, sin reconstruir lectividad', async () => {
  const value = { anio_escolar_id: '1', nivel: 'INICIAL', desde: '2026-11-14', hasta: '2026-11-14',
    dias: [{ fecha: '2026-11-14', es_lectivo: true, origen: 'EXCEPCION', descripcion: 'Recuperación de sábado' }] };
  http.httpClient.defaults.adapter = async config => {
    assert.equal(config.url, '/calendario-lectivo'); assert.equal(config.method, 'get');
    assert.deepEqual(config.params, { anio_escolar_id: '1', nivel: 'INICIAL', desde: value.desde, hasta: value.hasta });
    return response(config, value);
  };
  assert.deepEqual(await calendarApi.getCalendarDay('1', 'INICIAL', value.desde), value);
});

test('día no lectivo informa sin afirmar inexistencia de sesión; recuperación explícita sigue disponible', () => {
  const html = renderToStaticMarkup(h(CalendarDayInfo, { day: {
    fecha: '2026-11-14', es_lectivo: false, origen: 'EXCEPCION', descripcion: 'Feriado',
  } }));
  assert.match(html, /Hoy no hay clases. La asistencia está deshabilitada para esta fecha/);
  assert.doesNotMatch(html, /Feriado|Si ya existe una sesión/);
  assert.doesNotMatch(html, /<button|disabled/);
  assert.match(markup(), />Abrir asistencia<\/button>/);
});

test('calendario normal no añade avisos; excepciones y ausencia de clases sí se muestran', async () => {
  const today = (await vite.ssrLoadModule('/src/shared/dates/civilDate.ts')).peruToday();
  assert.equal(renderToStaticMarkup(h(CalendarDayInfo, { day: {
    fecha: today, es_lectivo: true, origen: 'REGLA_SEMANAL', descripcion: null,
  } })), '');
  const noClasses = renderToStaticMarkup(h(CalendarDayInfo, { day: {
    fecha: today, es_lectivo: false, origen: 'REGLA_SEMANAL', descripcion: null,
  } }));
  assert.match(noClasses, /Hoy no hay clases/);
  const recovery = renderToStaticMarkup(h(CalendarDayInfo, { day: {
    fecha: today, es_lectivo: true, origen: 'EXCEPCION', descripcion: 'Recuperación autorizada',
  } }));
  assert.match(recovery, /Clases habilitadas en el calendario/); assert.match(recovery, /Recuperación autorizada/);
  assert.doesNotMatch(recovery, /no hay clases|No se puede iniciar/);
  for (const rol of ['REGISTRADOR', 'ADMIN', 'SUBDIRECCION']) {
    const html = renderToStaticMarkup(h(Auth.Provider, { value: { session: { user: { rol } } } }, h(CalendarDayInfo, { day: {
      fecha: today, es_lectivo: true, origen: 'EXCEPCION', descripcion: 'Día lectivo / recuperación',
    } })));
    assert.match(html, /Día lectivo \/ recuperación/);
    assert.equal(html.includes('Día de clases'), rol === 'REGISTRADOR');
    assert.equal(html.includes('Clases habilitadas en el calendario'), rol !== 'REGISTRADOR');
  }
});

test('estado después de abrir distingue nueva, abierta existente y cerrada sin modificar registros', () => {
  const opened = { ...data, sesion: { ...data.sesion, estado: 'ABIERTA' } };
  assert.match(renderToStaticMarkup(h(View, { data: opened, created: true, editable: true })), /Registro de asistencia/);
  assert.match(renderToStaticMarkup(h(View, { data: opened, created: false, editable: true })), /Registro de asistencia/);
  assert.match(renderToStaticMarkup(h(View, { data, created: false, editable: true })), /Registro de asistencia/);
});

test('sesiones abiertas y cerradas muestran estados y resumen recibido solo como lectura', () => {
  for (const estado of ['ABIERTA', 'CERRADA']) {
    const html = renderToStaticMarkup(h(View, { data: { ...data, sesion: { ...data.sesion, estado } } }));
    assert.match(html, /Pérez Ana/); assert.match(html, /Sin marcar/);
    assert.match(html, /Buscar estudiante/); assert.doesNotMatch(html, /Resumen de asistencia/); assert.match(html, /Solo consulta/);
    assert.doesNotMatch(html, /PENDIENTE|<button|<select|usuario_id|9007199254740995|null/);
  }
});

test('identidad de sesión usa cuenta/año/sección/fecha, sin depender del objeto recibido', () => {
  const key = opening.attendanceScopeKey('6', selection, '2026-11-13');
  assert.equal(opening.attendanceScopeKey('6', structuredClone(selection), '2026-11-13'), key);
  for (const [account, selected, date] of [['7', selection, '2026-11-13'],
    ['6', { ...selection, year: { ...selection.year, id: '2' } }, '2026-11-13'],
    ['6', { ...selection, section: { ...selection.section, id: '2' } }, '2026-11-13'],
    ['6', selection, '2026-11-12'], [null, selection, '2026-11-13'], ['6', null, '2026-11-13']]) {
    assert.notEqual(opening.attendanceScopeKey(account, selected, date), key);
  }
});

test('permisos y conflictos se informan; errores de red/servidor advierten resultado incierto sin reintento', async () => {
  for (const [status, expected] of [[400, /Revisa la sección/], [403, /No tienes permiso para realizar esta acción\./],
    [404, /no está disponible, o no tienes permiso/], [409, /fecha sea lectiva y no futura/],
    [500, /podría haberse creado/], [undefined, /No se repetirá automáticamente/]]) {
    let attempts = 0;
    http.httpClient.defaults.adapter = async config => {
      attempts++;
      throw new AxiosError('detalle interno', 'ERR_BAD_REQUEST', config, undefined, status ? { status, config } : undefined);
    };
    const values = [];
    opening.observeAttendanceOpening(selection.section.id, '2026-11-13', value => values.push(value));
    await setImmediate();
    assert.equal(attempts, 1); assert.equal(values[0].data, null);
    assert.match(values[0].error, expected); assert.doesNotMatch(values[0].error, /detalle interno/);
  }
});

test('401 en apertura mantiene Bearer y señal de sesión para la invalidación global', async () => {
  const controller = new AbortController(), expired = [];
  const disconnect = http.connectHttpSession({ current: () => ({ token: 'ficticio', signal: controller.signal }),
    unauthorized: token => expired.push(token) });
  try {
    http.httpClient.defaults.adapter = async config => {
      assert.equal(config.signal, controller.signal); assert.equal(config.headers.get('Authorization'), 'Bearer ficticio');
      throw new AxiosError('401', 'ERR_BAD_REQUEST', config, undefined, { status: 401, config });
    };
    await assert.rejects(api.openAttendance(selection.section.id, '2026-11-13'));
    assert.deepEqual(expired, ['ficticio']);
  } finally { disconnect(); }
});

test('invalidación de apertura o calendario descarta tanto resultados como errores antiguos', async () => {
  for (const start of [receive => opening.observeAttendanceOpening(selection.section.id, '2026-11-13', receive),
    receive => calendar.observeAttendanceCalendar(selection, '2026-11-13', receive)]) {
    const pending = [], values = [];
    http.httpClient.defaults.adapter = config => new Promise((resolve, reject) => pending.push({ config, resolve, reject }));
    const stop = start(value => values.push(value)); await setImmediate(); stop();
    start(value => values.push(value)); await setImmediate();
    pending[1].resolve(response(pending[1].config, data)); await setImmediate();
    pending[0].resolve(response(pending[0].config, { ...data, creada: true })); await setImmediate();
    assert.equal(values.length, 1); assert.equal(values[0].data.creada, false);
    const stopError = start(value => values.push(value)); await setImmediate(); stopError();
    pending[2].reject(new Error('respuesta antigua')); await setImmediate();
    assert.equal(values.length, 1);
  }
});
