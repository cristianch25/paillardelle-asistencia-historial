import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('fecha única: se conserva entre búsqueda, salones, guardado y regreso sin escrituras por navegar',
  { skip: !hasEdge, timeout: 120000 }, async () => {
    const ui = await authBrowser('mobileAttendanceHarness.jsx');
    const { evaluate, wait, click } = ui;
    const cards = `document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li')`;
    const rows = `document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li')`;
    const hits = `document.querySelectorAll('[aria-label="Coincidencias de mis estudiantes"] li button')`;
    const writes = () => evaluate('mobileTest.calls.filter(call => ["post", "patch"].includes(call.method)).length');
    async function input(type, value) {
      await evaluate(`(() => { const input = document.querySelector('input[type=${type}]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    async function main(date) {
      await evaluate('document.querySelector("#main-content header a").click()'); await wait(`${cards}.length === 2`);
      assert.equal(await evaluate('document.querySelectorAll("input[type=date]").length'), 1);
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), date);
    }
    async function classroom(index, date) {
      await evaluate(`${cards}[${index}].querySelector('button').click()`); await wait(`${rows}.length === 2`);
      assert.equal(await evaluate('document.querySelectorAll("input[type=date]").length'), 0);
      assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Ver perfil|Las marcas se guardan solo|Se aplica a los estudiantes/);
      assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Asistencia del/);
      assert.equal(await evaluate('mobileTest.calls.filter(call => call.url === "/asistencias/sesiones" && call.params?.seccion_id).at(-1).params.fecha'), date);
    }
    try {
      await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await ui.navigate('/login'); await ui.login(); await ui.setRoute('/asistencias'); await wait(`${cards}.length === 2`);
      const today = await evaluate('new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())');
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), today);
      await input('date', '2026-10-01'); await input('search', 'mari pere'); await wait(`${hits}.length === 2`);
      assert.equal(await writes(), 0);
      await evaluate(`${hits}[1].click()`); await wait('Boolean(document.querySelector("dialog[open] button[aria-pressed]"))');
      assert.match(await evaluate('document.querySelector("dialog[open]").textContent'), /01\/10\/2026/);
      await click('Tardanza'); assert.equal(await writes(), 0); await click('Guardar cambios');
      await wait('!document.querySelector("dialog[open]") && document.body.textContent.includes("Asistencia guardada")');
      assert.equal(await writes(), 2);
      assert.deepEqual(await evaluate('Object.keys(mobileTest.stores)'), ['3:2026-10-01']);
      await classroom(0, '2026-10-01'); assert.equal(await writes(), 2);
      await main('2026-10-01'); await classroom(1, '2026-10-01');
      assert.equal(await evaluate(`${rows}[0].querySelector('button[aria-pressed=true]').textContent.trim()`), 'Tardanza');
      await evaluate(`Array.from(${rows}[1].querySelectorAll('button')).find(button => button.textContent.trim() === 'Presente').click()`);
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      assert.equal(await writes(), 3); await main('2026-10-01');
      const historical = await evaluate('JSON.stringify(mobileTest.stores)');
      await input('date', '2026-10-02'); assert.equal(await writes(), 3);
      await evaluate("mobileTest.blockedLevels.push('INICIAL:2026-10-02')");
      await classroom(0, '2026-10-02'); await wait('document.body.textContent.includes("Hoy no hay clases")');
      assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 0);
      assert.doesNotMatch(await evaluate('document.body.textContent'), /Guardar cambios|Marcar todos/);
      await main('2026-10-02'); await classroom(1, '2026-10-02');
      await wait(`${rows}[0].querySelectorAll('button[aria-pressed]').length === 4`);
      assert.equal(await writes(), 3); assert.equal(await evaluate('JSON.stringify(mobileTest.stores)'), historical);
      await evaluate('history.back()'); await wait(`${cards}.length === 2`);
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-10-02');
      await input('date', '2026-12-01'); await classroom(1, '2026-12-01');
      await wait('document.body.textContent.includes("fecha futura")');
      assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 0);
      assert.equal(await writes(), 3); await main('2026-12-01');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= 320'), true);
      await click('Cerrar sesión'); await wait('location.pathname === "/login"'); await ui.login(); await ui.setRoute('/asistencias');
      await wait(`${cards}.length === 2`); assert.equal(await evaluate('document.querySelector("input[type=date]").value'), today);
    } finally { await ui.close(); }
  });
