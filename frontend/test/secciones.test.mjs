import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router';

// Contratos aislados: adaptadores en memoria, sin cuentas, JWT ni MySQL.
let vite, client, yearsApi, sectionsApi, Filters, List, presentation, MySections, SelectionProvider, Auth;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  client = (await vite.ssrLoadModule('/src/shared/api/httpClient.ts')).httpClient;
  yearsApi = await vite.ssrLoadModule('/src/features/organizacion-escolar/anios-escolares/aniosEscolares.api.ts');
  sectionsApi = await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/secciones.api.ts');
  Filters = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/SeccionesFilters.tsx')).default;
  List = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/SeccionesList.tsx')).default;
  presentation = await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/sectionPresentation.ts');
  MySections = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/MisSeccionesPage.tsx')).default;
  Auth = (await vite.ssrLoadModule('/src/features/auth/AuthContext.ts')).AuthContext;
  SelectionProvider = (await vite.ssrLoadModule('/src/features/organizacion-escolar/secciones/SeccionSelectionProvider.tsx')).default;
});
after(async () => { await vite?.close(); });

function response(config, data) { return { status: 200, statusText: 'OK', headers: {}, config, data }; }

test('Mis secciones se presenta sin selectores ni selección automática de año', () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(Auth.Provider, { value: { session: null } }, createElement(SelectionProvider, null, createElement(MySections)))));
  assert.match(markup, />Mis secciones<\/h1>/);
  assert.doesNotMatch(markup, /<select|Filtros de secciones|Selecciona un año/);
  assert.match(markup, /Cargando mis secciones/);
});

test('consulta sin filtros usa el mismo endpoint y conserva la paginación del servidor', async () => {
  const expected = { secciones: [], pagination: { page: 2, limit: 20, has_more: false } };
  client.defaults.adapter = async config => {
    assert.equal(config.url, '/secciones/');
    assert.equal(config.method, 'get');
    assert.deepEqual(config.params, { page: 2, limit: 20 });
    return response(config, expected);
  };
  assert.deepEqual(await sectionsApi.getSections({ page: 2, limit: 20 }), expected);
});

test('años recorre has_more y conserva IDs BIGINT como strings sin escoger un año', async () => {
  const pages = [];
  client.defaults.adapter = async config => {
    assert.equal(config.method, 'get');
    assert.equal(config.url, '/anios-escolares');
    assert.equal(config.params.limit, 100);
    pages.push(config.params.page);
    return response(config, { anios_escolares: [{ id: config.params.page === 1 ? '9007199254740993' : '9007199254740994' }],
      pagination: { page: config.params.page, limit: 100, has_more: config.params.page === 1 } });
  };
  const years = await yearsApi.getAllSchoolYears();
  assert.deepEqual(pages, [1, 2]);
  assert.deepEqual(years.map(year => year.id), ['9007199254740993', '9007199254740994']);
});

test('secciones envía solo filtros admitidos y devuelve el sobre sin inventar totales', async () => {
  const query = { anio_escolar_id: '9007199254740993', nivel: 'INICIAL', grado: '4', activo: 'false', page: 2, limit: 20 };
  const expected = { secciones: [], pagination: { page: 2, limit: 20, has_more: false } };
  client.defaults.adapter = async config => {
    assert.equal(config.url, '/secciones/');
    assert.equal(config.method, 'get');
    assert.deepEqual(config.params, query);
    return response(config, expected);
  };
  assert.deepEqual(await sectionsApi.getSections(query), expected);
});

test('revalidación busca en páginas autorizadas, devuelve datos frescos y detecta pérdida de acceso', async () => {
  const section = { id: '9007199254740995', anio_escolar_id: '9007199254740993', activo: false };
  const pages = [];
  client.defaults.adapter = async config => {
    assert.deepEqual(Object.keys(config.params).sort(), ['anio_escolar_id', 'limit', 'page']);
    pages.push(config.params.page);
    return response(config, { secciones: config.params.page === 1 ? [] : [section],
      pagination: { page: config.params.page, limit: 100, has_more: config.params.page === 1 } });
  };
  assert.deepEqual(await sectionsApi.findAccessibleSection(section.id, section.anio_escolar_id), section);
  assert.deepEqual(pages, [1, 2]);
  client.defaults.adapter = async config => response(config, {
    secciones: [], pagination: { page: 1, limit: 100, has_more: false },
  });
  assert.equal(await sectionsApi.findAccessibleSection(section.id, section.anio_escolar_id), undefined);
});

test('fallos HTTP no se convierten en resultados vacíos ni generan reintentos', async () => {
  for (const status of [400, 401, 403, 500]) {
    let attempts = 0;
    client.defaults.adapter = async config => {
      attempts++;
      throw new AxiosError('HTTP', 'ERR_BAD_REQUEST', config, undefined, { status, config });
    };
    await assert.rejects(sectionsApi.getSections({ anio_escolar_id: '1', page: 1, limit: 20 }),
      error => error.response.status === status);
    assert.equal(attempts, 1);
  }
});

test('filtros no preseleccionan año; Inicial ofrece grupos 4/5 y las tres opciones de estado', () => {
  const markup = renderToStaticMarkup(createElement(Filters, {
    years: [], yearId: '', filters: { nivel: 'INICIAL', grado: '', activo: '' },
    onYearChange() {}, onFiltersChange() {},
  }));
  assert.match(markup, /value="" selected="">Selecciona un año/);
  assert.match(markup, /value="4"/);
  assert.match(markup, /value="5"/);
  assert.doesNotMatch(markup, /value="6"/);
  assert.match(markup, /value="true"/);
  assert.match(markup, /value="false"/);
});

test('lista conserva nombres completos, grupo, turno y estado, sin acciones de asistencia', () => {
  const markup = renderToStaticMarkup(createElement(List, {
    sections: [{ id: '9007199254740993', anio_escolar_id: '1', nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS', turno: 'MAÑANA', activo: false }],
    checking: false, onSelect() {},
  }));
  for (const label of ['4 años · CREATIVOS', 'Inicial', 'MAÑANA', 'Inactiva', 'Seleccionar']) assert.ok(markup.includes(label));
  assert.doesNotMatch(markup, /Registrar asistencia/);
});

test('tarjetas directas ofrecen asistencia y estudiantes por sección sin selección visual intermedia', () => {
  const sections = [1, 2].map(id => ({ id: String(id), anio_escolar_id: '1', nivel: 'SECUNDARIA', grado: id, letra: 'A', activo: true, turno: null }));
  const markup = renderToStaticMarkup(createElement(List, { sections, years: [{ id: '1', anio: 2026, estado: 'ABIERTO' }],
    checking: false, onOpen() {} }));
  assert.equal((markup.match(/>Asistencia diaria<\/button>/g) ?? []).length, 2);
  assert.equal((markup.match(/>Ver estudiantes<\/button>/g) ?? []).length, 2);
  assert.doesNotMatch(markup, />Seleccionar<|Sección seleccionada|disabled=/);
  assert.doesNotMatch(markup, /Año escolar:|2026|ABIERTO/);
  assert.match(markup, /Activa/);
  const unavailable = renderToStaticMarkup(createElement(List, { sections, years: [], checking: false, onOpen() {} }));
  assert.equal((unavailable.match(/disabled=""/g) ?? []).length, 4);
});

test('nombres de sección conservan el grado y nombre completos para los tres niveles', () => {
  for (const [nivel, grado, letra, expected] of [
    ['INICIAL', 4, 'CREATIVOS', '4 años · CREATIVOS'],
    ['INICIAL', 5, 'GENIALES', '5 años · GENIALES'],
    ['PRIMARIA', 1, 'A', '1.º A'],
    ['PRIMARIA', 2, 'B', '2.º B'],
    ['SECUNDARIA', 5, 'C', '5.º C'],
    ['PRIMARIA', 3, 'ABC', '3.º ABC'],
  ]) {
    const section = Object.freeze({ nivel, grado, letra });
    assert.equal(presentation.formatSectionName(section), expected);
    const markup = renderToStaticMarkup(createElement(List, {
      sections: [{ ...section, id: '1', anio_escolar_id: '1', activo: true, turno: null }],
      checking: false, onSelect() {},
    }));
    assert.ok(markup.includes(`>${expected}</h2>`));
    assert.doesNotMatch(markup, /<dt[^>]*>Grado:|<dt[^>]*>Grupo:/);
  }
});

test('etiquetas y opciones de grado/edad son legibles sin cambiar los valores de los filtros', () => {
  for (const [nivel, label, options] of [
    ['INICIAL', 'Edad', ['value="4">4 años', 'value="5">5 años']],
    ['PRIMARIA', 'Grado', ['value="1">1.º', 'value="6">6.º']],
    ['SECUNDARIA', 'Grado', ['value="1">1.º', 'value="5">5.º']],
    ['', 'Grado / edad', []],
  ]) {
    const markup = renderToStaticMarkup(createElement(Filters, {
      years: [], yearId: '', filters: { nivel, grado: '', activo: '' }, onYearChange() {}, onFiltersChange() {},
    }));
    assert.ok(markup.includes(`>${label}<select`));
    for (const option of options) assert.ok(markup.includes(option));
    if (nivel === 'SECUNDARIA') assert.doesNotMatch(markup, /value="6"/);
    assert.doesNotMatch(markup, /4\.º \/ 4 años|5\.º \/ 5 años/);
    if (!nivel) {
      const grade = markup.match(/<select[^>]*id="[^"]*-grade"[^>]*>[\s\S]*?<\/select>/)[0];
      assert.match(grade, / disabled=""/);
      assert.equal((grade.match(/<option/g) ?? []).length, 1);
      assert.match(grade, />Todos<\/option>/);
    }
  }
});
