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
    const fields = `document.querySelector('[aria-label="Filtros de supervisión"]').querySelectorAll('select, input')`;
    async function change(index, value) {
      await evaluate(`(() => { const e = ${fields}[${index}];
        Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    try {
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await ui.navigate('/login'); await ui.login();
      await evaluate('supervisionTest.cards = true'); await ui.setRoute('/asistencias/supervision');
      await wait(`Boolean(document.querySelector('[aria-label="Filtros de supervisión"]'))`);
      await change(0, '9007199254740993'); await wait(`${rows}.length === 3`);
      await t.test('abierta/cerrada/sin registro, lectividad y cinco totales sin peticiones individuales', async () => {
        const texts = await evaluate(`${rows}.map(row => row.textContent)`);
        assert.match(texts[0], /Sesión abierta.*Fecha lectiva.*Total de estudiantes30.*Faltas1.*Tardanzas2.*Pendientes3.*Presentes24/);
        assert.match(texts[1], /Sesión cerrada.*Fecha no lectiva.*Total de estudiantes32.*Faltas3.*Tardanzas1.*Pendientes0.*Presentes28/);
        assert.match(texts[2], /Sin registro.*Fecha no lectiva.*No hay sesión registrada/);
        assert.doesNotMatch(texts[2], /Faltas|Pendientes|Total de estudiantes/);
        assert.equal(await evaluate(`${mainCalls}.length`), 1);
        assert.equal(await evaluate('supervisionTest.calls.every(c => ["/anios-escolares", "/asistencias/sesiones"].includes(c.url) && c.method === "get")'), true);
      });
      await t.test('320 px: tarjetas legibles, sin controles de detalle ni desbordamiento', async () => {
        const layout = await evaluate(`({ width: document.documentElement.scrollWidth,
          cards: ${rows}.map(row => { const r = row.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; }),
          controls: ${rows}.some(row => row.querySelector('a,button,input,select')) })`);
        assert.ok(layout.width <= 320); assert.ok(layout.cards.every(card => card.left >= 0 && card.right <= 320 && card.width > 200));
        assert.equal(layout.controls, false);
        await evaluate(`${rows}[0].scrollIntoView({ block: 'start' })`);
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/supervision-cards-320.png', Buffer.from(screenshot.data, 'base64'));
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
        await evaluate('supervisionTest.account = "7"; supervisionTest.role = "SUBDIRECCION"; supervisionTest.level = "SECUNDARIA"; supervisionTest.hold = false');
        await ui.login(); await ui.setRoute('/asistencias/supervision');
        await wait(`Boolean(document.querySelector('[aria-label="Filtros de supervisión"]'))`);
        await evaluate('supervisionTest.pending.shift()()');
        assert.equal(await evaluate(`${rows}.length`), 0);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Total de estudiantes|Sesión abierta|Sesión cerrada/);
      });
      assert.equal(await evaluate('supervisionTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
