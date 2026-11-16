import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { sectionSearchBrowser } from './support/sectionSearchBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.0B: catálogo administrativo, búsqueda completa, acciones directas y aislamiento de REGISTRADOR',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 120000 }, async t => {
    const ui = await sectionSearchBrowser();
    const { evaluate, command, wait, click, rows, results, calls, search } = ui;
    try {
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await ui.navigate('/login'); await ui.signIn();
      await t.test('ADMIN espera año explícito y publica 230 secciones solo tras tres páginas', async () => {
        assert.equal(await evaluate(`${calls}.length`), 0);
        assert.equal(await evaluate('document.querySelectorAll("select").length'), 1);
        await evaluate('sectionSearchTest.holdPage = 2'); await ui.chooseYear('1');
        await wait('sectionSearchTest.pending.length === 1');
        assert.equal(await evaluate(`Boolean(${results})`), false); assert.equal(await evaluate(`${rows}.length`), 0);
        await ui.release(); await ui.ready();
        assert.match(await evaluate(`${results}.textContent`), /230 secciones encontradas/);
        assert.deepEqual(await evaluate(`${calls}.map(c => c.params.page)`), [1, 2, 3]);
        assert.ok((await evaluate(`${calls}.map(c => Object.keys(c.params).sort())`)).every(keys => keys.join(',') === 'anio_escolar_id,limit,page'));
        assert.equal(await evaluate(`${rows}.length`), 20);
        assert.doesNotMatch(await evaluate(`${results}.textContent`), /Sección seleccionada|Seleccionar|Seleccionada/);
        assert.ok(await evaluate(`${rows}.every(row => row.querySelectorAll('button').length === 1 && row.querySelector('button').textContent === 'Ver estudiantes')`));
        assert.doesNotMatch(await evaluate(`${results}.textContent`), /Asistencia diaria/);
      });
      await t.test('búsqueda flexible y paginación local sin HTTP por pulsación', async () => {
        const count = await evaluate(`${calls}.length`);
        await click('Siguiente'); await wait('document.body.textContent.includes("Página 2")');
        assert.equal(await evaluate(`${calls}.length`), count);
        for (const query of ['1A', '1 A', '1°A', '1.º A']) {
          await ui.type(query); await wait(`${rows}.length === 2`);
          assert.deepEqual(await evaluate(`${rows}.map(row => row.querySelector('h2').textContent)`), ['1 A', '1 A']);
        }
        assert.match(await evaluate(`${results}.textContent`), /Página 1/);
        await ui.type('primaria 1a'); await wait(`${rows}.length === 1`);
        assert.match(await evaluate(`${rows}[0].textContent`), /Primaria.*1 A/);
        await ui.type('11A'); await wait('document.body.textContent.includes("No se encontraron coincidencias")');
        await ui.type('creativ'); await wait(`${rows}.length === 1`);
        assert.match(await evaluate(`${rows}[0].textContent`), /Inicial.*4 años · CREATIVOS/);
        await ui.type('geniales'); await wait(`${rows}.length === 1`);
        assert.match(await evaluate(`${rows}[0].textContent`), /5 años · GENIALES.*Inactiva/);
        for (const text of ['p', 'pr', 'primaria', 'primaria 5', 'primaria 5e']) await ui.type(text);
        await wait(`${rows}.length === 1`);
        assert.match(await evaluate(`${rows}[0].textContent`), /5 E.*Inactiva/);
        assert.equal(await evaluate(`${calls}.length`), count, 'incluye coincidencia que estaba en la segunda página de la API');
      });
      await t.test('ADMIN solo consulta estudiantes: padrón, fecha y retorno conservan la búsqueda', async () => {
        await evaluate('sectionSearchTest.holdPage = 0');
        await click('Ver estudiantes'); await wait('location.pathname === "/secciones/estudiantes"');
        await wait('document.body.textContent.includes("Estudiantes de la sección")');
        await wait(`Boolean(document.querySelector('[aria-label="Estudiantes de la fecha consultada"] ul'))`);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Asistencia diaria/);
        assert.equal(await evaluate('Boolean(document.querySelector("input[type=date]"))'), false);
        const padronCalls = await evaluate('sectionSearchTest.calls.filter(c => c.url.endsWith("/padron")).length');
        assert.match(await evaluate('document.body.textContent'), /Padrón al \d{2}\/\d{2}\/\d{4}/);
        assert.equal(padronCalls, 1);
        await click('Volver a secciones'); await ui.ready();
        assert.equal(await evaluate(`${search}.value`), 'primaria 5e');
        assert.equal(await evaluate('sectionSearchTest.calls.some(c => c.method !== "get")'), false);
        assert.equal(await evaluate(`${rows}.length`), 1);
      });
      await t.test('320 px: nombres y acciones legibles, filtros etiquetados y sin desbordamiento', async () => {
        assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'));
        const heights = await evaluate(`Array.from(document.querySelectorAll('input[type=search], select, ul[aria-label="Secciones disponibles"] button')).map(e => e.getBoundingClientRect().height)`);
        assert.ok(heights.every(height => height >= 44));
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/sections-search-320.png', Buffer.from(screenshot.data, 'base64'));
      });
      await t.test('una sección revocada no permite navegar ni abrir asistencia aunque aún figure en el catálogo', async () => {
        await evaluate('sectionSearchTest.disappear = true'); await click('Ver estudiantes');
        await wait('document.body.textContent.includes("La sección seleccionada ya no está disponible")');
        assert.equal(await evaluate('location.pathname'), '/secciones');
        assert.equal(await evaluate('sectionSearchTest.calls.some(c => c.url.startsWith("/asistencias/sesiones"))'), false);
      });
      await t.test('SUBDIRECCION usa lo autorizado por secciones, sin ampliar Primaria a Inicial', async () => {
        await ui.signIn('SUBDIRECCION', ['PRIMARIA']); await ui.chooseYear('1'); await ui.ready();
        await ui.type('creativ'); await wait('document.body.textContent.includes("No se encontraron coincidencias")');
        assert.equal(await evaluate(`${rows}.length`), 0);
        await ui.signIn('SUBDIRECCION', ['PRIMARIA', 'INICIAL']); await ui.chooseYear('1'); await ui.ready();
        await ui.type('creativ'); await wait(`${rows}.length === 1`);
        assert.match(await evaluate(`${rows}[0].textContent`), /Inicial.*CREATIVOS/);
        assert.doesNotMatch(await evaluate(`${results}.textContent`), /Asistencia diaria/);
        assert.ok(await evaluate(`${rows}.every(row => row.querySelectorAll('button').length === 1)`));
        await click('Ver estudiantes'); await wait('location.pathname === "/secciones/estudiantes"');
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Asistencia diaria/);
        await click('Volver a secciones'); await ui.ready();
        await ui.signIn('SUBDIRECCION', ['SECUNDARIA']); await ui.chooseYear('1'); await ui.ready();
        assert.ok(await evaluate(`${rows}.every(row => row.querySelectorAll('button').length === 1)`));
        assert.doesNotMatch(await evaluate(`${results}.textContent`), /Asistencia diaria/);
        await evaluate(`${rows}[0].querySelector('button').click()`); await wait('location.pathname === "/secciones/estudiantes"');
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Asistencia diaria/);
      });
      await t.test('REGISTRADOR conserva interfaz, formato, acciones y paginación anteriores', async () => {
        await ui.signIn('REGISTRADOR');
        assert.equal(await evaluate(`Boolean(${search})`), false);
        assert.equal(await evaluate('document.querySelectorAll("select").length'), 0);
        assert.match(await evaluate('document.body.textContent'), /Mis secciones.*5.º E/);
        assert.equal(await evaluate(`${calls}.at(-1).params.limit`), 20);
        assert.equal(await evaluate(`${calls}.at(-1).params.anio_escolar_id === undefined`), true);
        assert.ok(await evaluate(`${rows}[0].querySelectorAll('button').length === 2`));
        await click('Ver estudiantes'); await wait('location.pathname === "/secciones/estudiantes"');
        await wait(`Boolean(document.querySelector('a[href^="/secciones/asistencia"]'))`);
        await evaluate(`document.querySelector('a[href^="/secciones/asistencia"]').click()`);
        await wait('location.pathname === "/secciones/asistencia"');
        await wait('Boolean(document.querySelector("button[aria-describedby=opening-hint]"))');
      });
      assert.equal(await evaluate('sectionSearchTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
