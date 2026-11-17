import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('refinamiento UX: tarjetas directas, apertura, calendario y marcas confirmadas',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, command, rows } = ui;
    const cards = `document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li')`;
    const action = `document.querySelector('button[aria-describedby="opening-hint"]')`;
    async function sections() {
      await evaluate(`document.querySelector('aside a[href="/secciones"]').click()`);
      await wait(`${cards}.length > 0`);
    }
    async function direct(label = 'Asistencia diaria', index = 0) {
      await evaluate(`Array.from(${cards}[${index}].querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
    }
    try {
      await ui.prepare(); await sections();
      await t.test('una sección: ambas acciones directas, sin tarjeta redundante ni POST al navegar', async () => {
        assert.equal(await evaluate(`${cards}.length`), 1);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Sección seleccionada|Seleccionada/);
        const previous = await evaluate('navigationTest.calls.filter(c => c.method === "post").length');
        await direct('Ver estudiantes'); await wait('location.pathname === "/secciones/estudiantes"');
        await wait('document.body.textContent.includes("4 estudiantes en esta fecha")');
        assert.match(await evaluate('document.body.textContent'), /CREATIVOS|Pérez/);
        await sections(); await direct(); await wait('location.pathname === "/secciones/asistencia"');
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "post").length'), previous);
        assert.equal(await evaluate(`${action}.textContent.trim()`), 'Abrir asistencia');
      });
      await t.test('varias secciones: valida la tarjeta elegida antes de navegar', async () => {
        await evaluate('navigationTest.extraSections = [{ id: "3", anio_escolar_id: "1", nivel: "INICIAL", grado: 5, letra: "GENIALES", activo: true, turno: null }]');
        await sections(); await wait(`${cards}.length === 2`);
        await evaluate('navigationTest.holdSections = true'); await direct('Asistencia diaria', 1);
        await wait('Boolean(navigationTest.release)'); assert.equal(await evaluate('location.pathname'), '/secciones');
        await evaluate('navigationTest.holdSections = false; navigationTest.release()');
        await wait('location.pathname === "/secciones/asistencia"');
        assert.match(await evaluate(`document.querySelector('[aria-label="Detalle de sección"]').textContent`), /GENIALES — Inicial/);
      });
      await t.test('una tarjeta que perdió autorización no navega ni inicia asistencia', async () => {
        await sections();
        const previous = await evaluate('navigationTest.calls.filter(c => c.method === "post").length');
        await evaluate('navigationTest.allow = false'); await direct();
        await wait('document.body.textContent.includes("ya no está disponible para tu cuenta")');
        assert.equal(await evaluate('location.pathname'), '/secciones');
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "post").length'), previous);
        await evaluate('navigationTest.allow = true'); await direct('Asistencia diaria', 1);
        await wait('location.pathname === "/secciones/asistencia"');
      });
      await t.test('nueva sesión solo tras acción explícita; abierta y cerrada tienen estados claros', async () => {
        await ui.setDate('2026-11-13'); await evaluate('navigationTest.server.sesion.seccion_id = "3"; navigationTest.sessionCreated = true');
        assert.equal(await evaluate(`${action}.textContent.trim()`), 'Abrir asistencia');
        await click('Abrir asistencia'); await wait('document.body.textContent.includes("Registro de asistencia")');
        assert.equal(await evaluate(`Boolean(${action})`), false);
        assert.equal(await evaluate('Boolean(document.querySelector("#opening-hint"))'), false);
        await ui.setDate('2026-11-12'); await wait(`Boolean(${action})`);
        const posts = await evaluate('navigationTest.calls.filter(c => c.method === "post").length');
        await ui.setDate('2026-11-13'); await wait(`Boolean(${action})`);
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "post").length'), posts);
        await click('Abrir asistencia'); await wait('document.body.textContent.includes("Registro de asistencia")');
        assert.equal(await evaluate(`Boolean(${action})`), false);
        await ui.setDate('2026-11-12'); await wait(`Boolean(${action})`);
        await evaluate('navigationTest.sessionState = "CERRADA"'); await click('Abrir asistencia');
        await wait('document.body.textContent.includes("Registro de asistencia")');
        assert.equal(await evaluate(`Boolean(${action})`), false);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Continuar asistencia|Consultar asistencia|Abrir asistencia/);
        assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 16);
      });
      await t.test('salir sin guardar preserva las marcas confirmadas en el servidor', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente'); await ui.save(); await ui.choose(0, 'Falta');
        await ui.menu('/secciones'); await ui.guard(); await ui.confirm(); await wait(`${cards}.length > 0`);
        await direct(); await wait('location.pathname === "/secciones/asistencia"'); await click('Abrir asistencia');
        await wait(`${rows}.length === 4`);
        assert.equal(await evaluate(`${rows}[0].querySelector('button[aria-pressed="true"]').textContent.trim()`), 'Presente');
        assert.equal(await ui.dirty(), 0); assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 1);
      });
      await t.test('calendario normal silencioso; hoy/otra fecha sin clases y recuperación explícita', async () => {
        await ui.prepare(); assert.doesNotMatch(await evaluate('document.body.textContent'), /Fecha lectiva/);
        await evaluate('navigationTest.calendar = { es_lectivo: false, origen: "EXCEPCION", descripcion: "Sin clases" }');
        const today = await evaluate('new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())');
        await ui.setDate(today); await wait('document.body.textContent.includes("Hoy no hay clases")');
        await ui.setDate('2026-11-12'); await wait('document.body.textContent.includes("No hay clases en esta fecha")');
        await evaluate('navigationTest.calendar = { es_lectivo: true, origen: "EXCEPCION", descripcion: "Recuperación autorizada" }');
        await ui.setDate('2026-11-14'); await wait('document.body.textContent.includes("Recuperación autorizada")');
        assert.equal(await evaluate(`${action}.disabled`), false);
      });
      await t.test('nombre completo, contexto compacto y acciones accesibles desde 320 px', async () => {
        await ui.prepare(); await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        const name = 'Nombreextensoparacomprobaridentidadcompleta María del Rosario';
        await evaluate(`authTest.userName = ${JSON.stringify(name)}`); await ui.login(); await sections();
        for (const width of [320, 375, 768, 1280]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
          assert.ok(await evaluate(`Array.from(${cards}[0].querySelectorAll('button')).every(b => b.getBoundingClientRect().height >= 44)`));
          if (width === 320) {
            const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            await writeFile('node_modules/.tmp/sections-ux-320.png', Buffer.from(shot.data, 'base64'));
          }
        }
        await direct();
        await wait('location.pathname === "/secciones/asistencia"'); await ui.setDate('2026-11-13'); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
        for (const width of [320, 375, 768, 1280]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
          const layout = await evaluate(`({ width: document.documentElement.scrollWidth, identity: document.querySelector('header').textContent,
            context: document.querySelector('[aria-label="Detalle de sección"] h2').textContent,
            actionHeight: ${rows}[0].querySelector('button').getBoundingClientRect().height })`);
          assert.ok(layout.width <= width, JSON.stringify(layout)); assert.ok(layout.actionHeight >= 44);
          assert.ok(layout.identity.includes(name)); assert.ok(layout.context.includes('— Inicial'));
          if (width === 320 || width === 1280) {
            await evaluate('window.scrollTo(0, 0)');
            const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            await writeFile(`node_modules/.tmp/attendance-ux-${width}.png`, Buffer.from(shot.data, 'base64'));
          }
        }
      });
    } finally { await ui.close(); }
  });
