import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7A.2: tarjetas, filtros rápidos, móvil y solo lectura',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await authBrowser('supervisionHarness.jsx');
    const { evaluate, command, wait, click } = ui;
    const rows = `Array.from(document.querySelectorAll('ul[aria-label="Secciones de supervisión"] > li'))`;
    const mainCalls = `supervisionTest.calls.filter(c => c.params?.limit === 20)`;
    const fields = `document.querySelector('[aria-label="Filtros de asistencias"]').querySelectorAll('select, input')`;
    async function change(index, value) {
      await evaluate(`(() => { const e = ${fields}[${index}];
        Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    try {
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await ui.navigate('/login'); await ui.login();
      await evaluate('supervisionTest.cards = true'); await ui.setRoute('/asistencias/supervision');
      await wait(`Boolean(document.querySelector('[aria-label="Filtros de asistencias"]'))`);
      await change(0, '9007199254740993'); await wait(`${rows}.length === 3`);
      await t.test('abierta/cerrada/sin registro y lectividad, sin contadores ni peticiones individuales', async () => {
        const texts = await evaluate(`${rows}.map(row => row.textContent)`);
        assert.match(texts[0], /Sesión abierta.*Fecha lectiva.*Ver detalle/);
        assert.match(texts[1], /Sesión cerrada.*Fecha no lectiva.*Ver detalle/);
        assert.match(texts[2], /Sin registro.*Fecha no lectiva.*No hay sesión registrada/);
        for (const text of texts) assert.doesNotMatch(text, /Faltas|Tardanzas|Presentes|Pendientes|Total de estudiantes/);
        assert.equal(await evaluate(`${rows}[2].querySelector('a') === null`), true);
        assert.equal(await evaluate(`${rows}[0].querySelector('a').getAttribute('href')`), '/asistencias/supervision/9007199254741995');
        assert.equal(await evaluate(`${mainCalls}.length`), 1);
        assert.equal(await evaluate('supervisionTest.calls.every(c => ["/anios-escolares", "/asistencias/sesiones"].includes(c.url) && c.method === "get")'), true);
      });
      await t.test('escritorio y móvil: tarjetas uniformes y enlaces con borde, sin desbordamiento', async () => {
        for (const width of [1280, 412, 320]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width < 600 });
        const layout = await evaluate(`({ width: document.documentElement.scrollWidth,
          cards: ${rows}.map(row => { const r = row.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; }),
          controls: ${rows}.some(row => row.querySelector('button,input,select')) })`);
        assert.ok(layout.width <= width); assert.ok(layout.cards.every(card => card.left >= 0 && card.right <= width && card.width > 200));
        assert.equal(layout.controls, false);
        assert.equal(await evaluate(`${rows}.some(row => row.querySelector('dl'))`), false);
        assert.equal(await evaluate(`getComputedStyle(${rows}[0].querySelector('a')).borderStyle`), 'solid');
        if (width === 1280) assert.ok(Math.max(...layout.cards.map(c=>c.height))-Math.min(...layout.cards.map(c=>c.height)) <= 24);
        await evaluate('window.scrollTo(0,0)');
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/supervision-cards-${width}.png`, Buffer.from(screenshot.data, 'base64'));
        }
      });
      await t.test('cambios rápidos de fecha/nivel ocultan tarjetas previas e ignoran conteos tardíos', async () => {
        await evaluate('supervisionTest.hold = true'); await change(1, '2026-11-12');
        await wait('supervisionTest.pending.length === 1');
        assert.equal(await evaluate(`${rows}.length`), 0);
        await evaluate('supervisionTest.hold = false; supervisionTest.cards = false');
        await change(2, 'PRIMARIA'); await wait(`${rows}.length === 1`);
        await evaluate('supervisionTest.pending.shift()()');
        assert.match(await evaluate(`${rows}[0].textContent`), /Primaria.*Sin registro/);
        assert.doesNotMatch(await evaluate(`${rows}[0].textContent`), /Total de estudiantes|Sesión abierta|Sesión cerrada/);
        assert.equal(await evaluate(`${rows}.length`), 1);
      });
      await t.test('cambio de cuenta retira conteos y la respuesta en vuelo no los restaura', async () => {
        await evaluate('supervisionTest.cards = true; supervisionTest.hold = true'); await change(1, '2026-11-13');
        await wait('supervisionTest.pending.length === 1');
        await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        await evaluate('supervisionTest.account = "7"; supervisionTest.role = "SUBDIRECCION"; supervisionTest.level = "SECUNDARIA"; supervisionTest.hold = false; supervisionTest.cards = false');
        await ui.login(); await ui.setRoute('/asistencias/supervision');
        await wait(`Boolean(document.querySelector('[aria-label="Filtros de asistencias"]'))`);
        await evaluate('supervisionTest.pending.shift()()');
        await wait(`${rows}.length === 1`);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Total de estudiantes|Sesión abierta|Sesión cerrada/);
      });
      assert.equal(await evaluate('supervisionTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
