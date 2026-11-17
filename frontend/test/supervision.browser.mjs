import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7A.1: consulta protegida, filtros, errores y móvil',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await authBrowser('supervisionHarness.jsx');
    const { evaluate, command, wait, click } = ui;
    const results = `document.querySelector('[aria-label="Resultados de supervisión"]')`;
    const calls = `supervisionTest.calls.filter(c => c.url === '/asistencias/sesiones' && c.params.limit === 20)`;
    const last = `${calls}.at(-1).params`;
    const filters = `document.querySelector('[aria-label="Filtros de supervisión"]')`;
    const field = index => `${filters}.querySelectorAll('select, input')[${index}]`;
    async function change(index, value) {
      await evaluate(`(() => { const input = ${field(index)};
        Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')
          .set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    async function settled() { await wait(`Boolean(${results}) && ${field(3)}.getAttribute('aria-busy') === 'false'`); }
    async function open() {
      await ui.setRoute('/asistencias/supervision'); await wait(`Boolean(${filters})`);
    }
    async function signIn(role = 'ADMIN', level = null, account = '9007199254740993') {
      if (await evaluate('Boolean(document.querySelector("#main-content"))')) {
        await click('Cerrar sesión'); await wait('location.pathname === "/login"');
      }
      await evaluate(`Object.assign(supervisionTest, { role: ${JSON.stringify(role)}, level: ${JSON.stringify(level)},
        account: ${JSON.stringify(account)}, status: null, empty: false, hold: false })`);
      await ui.login(); await open(); await settled();
    }
    try {
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
      await ui.navigate('/login');
      await t.test('ruta directa sin autenticación permanece en login sin consultas', async () => {
        await ui.setRoute('/asistencias/supervision'); await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${calls}.length`), 0);
      });
      await t.test('ADMIN accede sin selección previa ni consulta general de secciones', async () => {
        await signIn();
        assert.equal(await evaluate(`${field(0)}.value`), '9007199254740993', 'selecciona el año calendario actual');
        await change(0, '9007199254740993'); await settled();
        assert.equal(await evaluate(`${last}.anio_escolar_id`), '9007199254740993');
        assert.equal(await evaluate(`${last}.page`), 1);
        assert.match(await evaluate(`${results}.textContent`), /CREATIVOS/);
        assert.equal(await evaluate('supervisionTest.calls.some(c => c.url.includes("/secciones"))'), false);
        assert.deepEqual(await evaluate(`Array.from(${field(2)}.options).map(o => o.value)`), ['', 'INICIAL', 'PRIMARIA', 'SECUNDARIA']);
      });
      await t.test('fechas inválidas o fuera del año ocultan resultados y no consultan listado ni opciones', async () => {
        const allCalls = 'supervisionTest.calls.filter(c => c.url === "/asistencias/sesiones").length';
        assert.equal(await evaluate(`${field(1)}.min`), '2026-01-01');
        assert.equal(await evaluate(`${field(1)}.max`), '2026-12-31');
        for (const date of ['', '2026-02-30', '2025-12-31', '2027-01-01']) {
          const before = await evaluate(allCalls);
          await change(1, date);
          await wait(`${field(1)}.getAttribute('aria-invalid') === 'true'`);
          await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          assert.match(await evaluate(`${filters}.textContent`), ['2025-12-31', '2027-01-01'].includes(date)
            ? /entre el 01\/01\/2026 y el 31\/12\/2026/ : /fecha válida/);
          assert.equal(await evaluate(allCalls), before);
          assert.equal(await evaluate(`Boolean(${results})`), false);
          assert.equal(await evaluate(`${field(3)}.disabled`), true);
        }
        for (const date of ['2026-01-01', '2026-12-31', '2026-11-15']) {
          await change(1, date); await settled();
          assert.equal(await evaluate(`${last}.fecha`), date);
          assert.equal(await evaluate(`${field(1)}.getAttribute('aria-invalid')`), 'false');
        }
      });
      await t.test('invalidar fecha descarta una respuesta anterior en vuelo', async () => {
        await evaluate('supervisionTest.hold = true'); await change(1, '2026-11-09');
        await wait('supervisionTest.pending.length === 1');
        await change(1, '2027-01-01');
        await wait(`${field(1)}.getAttribute('aria-invalid') === 'true'`);
        await evaluate('supervisionTest.hold = false; supervisionTest.pending.shift()()');
        await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        assert.equal(await evaluate(`Boolean(${results})`), false);
        await change(1, '2026-11-15'); await settled();
      });
      await t.test('opciones completas independientes del listado; sección, fecha, nivel y año reinician página', async () => {
        await click('Siguiente'); await settled(); await wait(`${last}.page === 2`);
        assert.match(await evaluate(`${results}.textContent`), /GENIALES/);
        assert.deepEqual(await evaluate(`Array.from(${field(3)}.options).map(o => o.value)`), ['', '9007199254740995', '9007199254740996']);
        await change(3, '9007199254740996'); await settled();
        assert.equal(await evaluate(`${last}.seccion_id`), '9007199254740996');
        assert.equal(await evaluate(`${last}.page`), 1);
        await change(3, ''); await settled(); await click('Siguiente'); await settled();
        await change(1, '2026-11-14'); await settled();
        assert.equal(await evaluate(`${last}.fecha`), '2026-11-14');
        assert.equal(await evaluate(`${last}.page`), 1);
        assert.equal(await evaluate(`${field(3)}.options.length`), 3, 'carga las dos secciones sin visitar páginas');
        await click('Siguiente'); await settled(); await change(2, 'PRIMARIA'); await settled();
        assert.equal(await evaluate(`${last}.nivel`), 'PRIMARIA');
        assert.equal(await evaluate(`${last}.page`), 1);
        await click('Siguiente'); await settled(); await change(0, '2'); await settled();
        assert.equal(await evaluate(`${last}.anio_escolar_id`), '2');
        assert.equal(await evaluate(`${last}.page`), 1);
        assert.equal(await evaluate(`${last}.seccion_id === undefined`), true);
      });
      await t.test('vacío es éxito con paginación; actualizar revalida una sola consulta', async () => {
        await evaluate('supervisionTest.empty = true');
        const count = await evaluate(`${calls}.length`);
        await click('Actualizar consulta'); await settled();
        assert.match(await evaluate(`${results}.textContent`), /No hay secciones/);
        assert.equal(await evaluate(`${calls}.length`), count + 1);
        assert.equal(await evaluate(`Boolean(${results}.querySelector('nav'))`), true);
        await evaluate('supervisionTest.empty = false'); await click('Actualizar consulta'); await settled();
      });
      await t.test('respuestas y errores tardíos no reemplazan filtros vigentes; sin resultados obsoletos en carga', async () => {
        await evaluate('supervisionTest.hold = true'); await change(1, '2026-11-12');
        await wait('supervisionTest.pending.length === 1');
        assert.equal(await evaluate(`Boolean(${results})`), false);
        await evaluate('supervisionTest.hold = false'); await change(1, '2026-11-13'); await settled();
        await evaluate('supervisionTest.pending.shift()()');
        await wait(`${results}.textContent.includes('2026-11-13')`);
        await evaluate('supervisionTest.hold = true; supervisionTest.status = 403'); await change(1, '2026-11-12');
        await wait('supervisionTest.pending.length === 1');
        await evaluate('supervisionTest.hold = false; supervisionTest.status = null');
        await change(1, '2026-11-14'); await settled(); await evaluate('supervisionTest.pending.shift()()');
        await wait(`${results}.textContent.includes('2026-11-14')`);
        assert.equal(await evaluate('Boolean(document.querySelector("[role=alert]"))'), false);
      });
      await t.test('400/403/404/red se muestran como errores sin lista vacía ni datos previos', async () => {
        for (const [status, message] of [[400, /Revisa los filtros/], [403, /No tienes permiso/],
          [404, /no están disponibles/], ['network', /conectar con el servidor/]]) {
          await evaluate(`supervisionTest.status = ${JSON.stringify(status)}`);
          if (await evaluate(`Boolean(${results})`)) await click('Actualizar consulta');
          else await click('Reintentar consulta');
          await wait('Boolean(document.querySelector("[role=alert]"))');
          assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), message);
          assert.equal(await evaluate(`Boolean(${results})`), false);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Detalle privado|No hay secciones/);
        }
        await evaluate('supervisionTest.status = null'); await click('Reintentar consulta'); await settled();
      });
      await t.test('320 px: sin desborde, filtros etiquetados, controles táctiles y sin detalle', async () => {
        const measurements = await evaluate(`({ width: document.documentElement.scrollWidth,
          heights: Array.from(${filters}.querySelectorAll('select, input')).map(e => e.getBoundingClientRect().height),
          labels: Array.from(${filters}.querySelectorAll('select, input')).every(e => e.labels.length === 1),
          links: ${results}.querySelectorAll('a').length })`);
        assert.ok(measurements.width <= 320); assert.ok(measurements.heights.every(height => height >= 44));
        assert.equal(measurements.labels, true); assert.equal(measurements.links, 0);
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/supervision-320.png', Buffer.from(screenshot.data, 'base64'));
      });
      await t.test('cambio de cuenta descarta filtros y consultas en vuelo', async () => {
        await evaluate('supervisionTest.hold = true'); await change(1, '2026-11-10');
        await wait('supervisionTest.pending.length === 1');
        await signIn('SUBDIRECCION', 'PRIMARIA', '7');
        assert.equal(await evaluate(`${field(0)}.value`), '9007199254740993');
        assert.equal(await evaluate(`Boolean(${results})`), true);
        assert.deepEqual(await evaluate(`Array.from(${field(2)}.options).map(o => o.value)`), ['', 'INICIAL', 'PRIMARIA']);
        await evaluate('supervisionTest.pending.shift()()');
        await change(0, '9007199254740993'); await settled();
        assert.doesNotMatch(await evaluate(`${results}.textContent`), /2026-11-10/);
        await signIn('SUBDIRECCION', 'SECUNDARIA');
        assert.deepEqual(await evaluate(`Array.from(${field(2)}.options).map(o => o.value)`), ['', 'SECUNDARIA']);
      });
      await t.test('401 invalida autenticación y REGISTRADOR no tiene menú ni acceso directo', async () => {
        await change(0, '9007199254740993'); await settled();
        await evaluate('supervisionTest.status = 401'); await click('Actualizar consulta');
        await wait('location.pathname === "/login"');
        await evaluate('supervisionTest.role = "REGISTRADOR"; supervisionTest.status = null');
        await ui.login();
        assert.equal(await evaluate(`Boolean(document.querySelector('a[href="/asistencias/supervision"]'))`), false);
        const count = await evaluate(`${calls}.length`);
        await ui.setRoute('/asistencias/supervision'); await wait('location.pathname === "/inicio"');
        assert.equal(await evaluate(`${calls}.length`), count);
      });
      assert.equal(await evaluate('supervisionTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
