import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { AxiosError } from 'axios';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, api, dates, Grid, client, scopes;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  api = await vite.ssrLoadModule('/src/features/organizacion-escolar/calendario-lectivo/calendario.api.ts');
  dates = await vite.ssrLoadModule('/src/features/organizacion-escolar/calendario-lectivo/calendarDates.ts');
  scopes = await vite.ssrLoadModule('/src/features/organizacion-escolar/calendario-lectivo/calendarScopes.ts');
  Grid = (await vite.ssrLoadModule('/src/features/organizacion-escolar/calendario-lectivo/CalendarMonthGrid.tsx')).default;
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
});

test('ADMIN comienza en Todos; SUBDIRECCION agrupa Inicial/Primaria únicamente con permisos explícitos', () => {
  const all = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];
  assert.deepEqual(scopes.calendarScopes({ rol: 'ADMIN' }, all)[0], { key: 'TODOS', label: 'Todos los niveles', levels: all });
  assert.deepEqual(scopes.calendarScopes({ rol: 'ADMIN' }, ['PRIMARIA']), []);
  assert.equal(scopes.calendarScopes({ rol: 'SUBDIRECCION', nivel_asignado: 'SECUNDARIA' }, ['SECUNDARIA']).length, 1);
  assert.deepEqual(scopes.calendarScopes({ rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }, ['PRIMARIA'])[0].levels, ['PRIMARIA']);
  assert.deepEqual(scopes.calendarScopes({ rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' }, ['INICIAL', 'PRIMARIA'])[0].levels, ['INICIAL', 'PRIMARIA']);
});
test('guardado de varios niveles usa un único PUT y exige confirmación de todo el conjunto', async () => {
  const levels = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'], calls = [];
  client.defaults.adapter = async config => {
    calls.push(config); const body = JSON.parse(config.data);
    return { config, status: 200, data: { excepciones: levels.map(nivel => ({ ...body, nivel, anio_escolar_id: '10', fecha: '2026-03-07' })) } };
  };
  await api.saveCalendarException('10', 'INICIAL', '2026-03-07', false, '', levels);
  assert.equal(calls.length, 1); assert.deepEqual(JSON.parse(calls[0].data).niveles, levels);
  client.defaults.adapter = async config => ({ config, status: 200, data: { excepciones: [] } });
  await assert.rejects(api.saveCalendarException('10', 'INICIAL', '2026-03-07', false, '', levels));
});
after(async () => { await vite?.close(); });
test('mes civil, navegación entre años y límites del año sin calcular lectividad', () => {
  const cells = dates.monthCells('2026-03'); assert.equal(cells[6], '2026-03-01'); assert.equal(cells.filter(Boolean).length, 31);
  assert.equal(dates.shiftedMonth('2026-12', 1), '2027-01'); assert.equal(dates.shiftedMonth('2026-01', -1), '2025-12');
  assert.deepEqual(dates.monthRange('2026-03', { fecha_inicio: '2026-03-05', fecha_fin: '2026-03-20' }), { desde: '2026-03-05', hasta: '2026-03-20' });
  assert.equal(dates.monthTitle('2026-11'), 'Noviembre de 2026');
});
test('cuadrícula amplia respeta sábado lectivo y día ordinario no lectivo del servidor', () => {
  const html = renderToStaticMarkup(h(Grid, { month: '2026-03', disabled: false, onSelect() {}, days: [
    { fecha: '2026-03-07', es_lectivo: true, origen: 'EXCEPCION', descripcion: 'Recuperación' },
    { fecha: '2026-03-10', es_lectivo: false, origen: 'EXCEPCION', descripcion: 'Feriado' },
  ] }));
  assert.match(html, /07\/03\/2026: Lectivo/); assert.match(html, /10\/03\/2026: No lectivo/);
  assert.match(html, /grid-cols-7/); assert.match(html, /sm:min-h-32/);
  assert.doesNotMatch(html, /Sin asistencia/);
  assert.match(html, /Recuperación|Feriado|Excepción/);
});
test('niveles se comprueban en calendario, no se infieren del perfil ni de secciones', async () => {
  const calls = [];
  client.defaults.adapter = async config => {
    calls.push(config);
    if (config.params.nivel === 'INICIAL') throw new AxiosError('denegado', '', config, null, { status: 403 });
    return { config, status: 200, data: { periodos_lectivos: [] } };
  };
  assert.deepEqual(await api.getCalendarLevels('10'), ['PRIMARIA', 'SECUNDARIA']);
  assert.ok(calls.every(row => row.url === '/periodos-lectivos' && row.params.anio_escolar_id === '10'));
  client.defaults.adapter = async config => { throw new AxiosError('privado', '', config, null, { status: 500 }); };
  await assert.rejects(api.getCalendarLevels('10'));
});
test('PUT existente: descripción opcional explícita, confirmación y errores sin reintento', async () => {
  const calls = [];
  client.defaults.adapter = async config => {
    calls.push(config); const body = JSON.parse(config.data);
    return { config, status: 200, data: { excepcion: { anio_escolar_id: '10', nivel: 'PRIMARIA', fecha: '2026-03-07', ...body } } };
  };
  await api.saveCalendarException('10', 'PRIMARIA', '2026-03-07', true, '');
  assert.equal(calls[0].url, '/calendario-lectivo/excepciones/10/PRIMARIA/2026-03-07');
  assert.deepEqual(JSON.parse(calls[0].data), { es_lectivo: true, descripcion: 'Día lectivo / recuperación' });
  assert.match(api.calendarError(new AxiosError('privado', '', {}, null, { status: 409, data: { error: 'No se puede bloquear una fecha con asistencias.' } })), /sesiones de asistencia/);
  assert.equal(calls.length, 1);
});
