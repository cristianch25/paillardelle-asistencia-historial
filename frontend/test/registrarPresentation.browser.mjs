import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('REGISTRADOR: títulos simples, Volver azul junto al título y guardado sin descripción técnica',
  { skip: !hasEdge, timeout: 90000 }, async () => {
    const ui = await authBrowser('mobileAttendanceHarness.jsx');
    const { evaluate, wait, click, command } = ui;
    const cards = `document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li')`;
    const rows = `document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li')`;
    const header = `document.querySelector('#main-content header')`;
    const bar = `document.querySelector('[aria-label="Guardado de asistencia"]')`;
    try {
      await ui.navigate('/login'); await wait('Boolean(window.mobileTest)');
      await evaluate("Object.assign(mobileTest.sections[0], { letra: 'EXPLORADORES' }); Object.assign(mobileTest.sections[1], { nivel: 'SECUNDARIA', grado: 2, letra: 'B' })");
      await ui.login(); await ui.setRoute('/asistencias'); await wait(`${cards}.length === 2`);
      assert.equal(await evaluate(`${cards}[0].querySelector('h2').textContent`), '4 años EXPLORADORES');
      assert.equal(await evaluate(`${cards}[1].querySelector('h2').textContent`), '2 B');
      await evaluate(`(() => { const input = document.querySelector('input[type=date]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2026-10-01');
        input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await evaluate(`${cards}[1].querySelector('button').click()`); await wait(`${rows}.length === 2`);
      assert.equal(await evaluate(`${header}.querySelector('h1').textContent`), '2 B');
      assert.equal(await evaluate(`${header}.querySelector('a').textContent.trim()`), 'Volver');
      assert.match(await evaluate(`${header}.querySelector('a').className`), /text-institutional-800/);
      assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Asistencia del|Detalles|\.º|— Secundaria/);
      for (const width of [320, 375, 768, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
        const layout = await evaluate(`(() => { const title = ${header}.querySelector('h1').getBoundingClientRect();
          const back = ${header}.querySelector('a').getBoundingClientRect();
          return { width: document.documentElement.scrollWidth, gap: back.left - title.right, y: Math.abs(title.top-back.top), height: back.height }; })()`);
        assert.ok(layout.width <= width); assert.ok(layout.gap >= 0); assert.ok(layout.y < 4); assert.ok(layout.height >= 44);
      }
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(button => button.textContent.trim() === 'Tardanza').click()`);
      await evaluate('window.dispatchEvent(new Event("focus"))');
      await wait(`${rows}.length === 2 && ${bar}?.getAttribute('aria-busy') === 'false' && ${rows}[0].textContent.includes('Sin guardar')`);
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.doesNotMatch(await evaluate(`${bar}.textContent`), /Acceso a la sesión|selecciones compatibles|coincidencias ya no se enviarán/);
      assert.match(await evaluate(`${bar}.textContent`), /1 cambio sin guardar|Guardar cambios/);
      assert.equal(await evaluate('mobileTest.calls.filter(call => call.method !== "get").length'), 0);
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile('node_modules/.tmp/registrar-presentation-320.png', Buffer.from(screenshot.data, 'base64'));
      await click('Guardar cambios'); await wait(`${bar}.textContent.includes('Cambios guardados correctamente')`);
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(button => button.textContent.trim() === 'Falta').click(); mobileTest.fail = 400`);
      await click('Guardar cambios'); await wait(`${bar}.textContent.includes('El servidor rechazó las marcas')`);
      assert.match(await evaluate(`${bar}.textContent`), /1 cambio sin guardar/);
      await evaluate('mobileTest.fail = null'); await click('Guardar cambios'); await wait(`${bar}.textContent.includes('Cambios guardados correctamente')`);
      await evaluate(`${header}.querySelector('a').click()`); await wait(`${cards}.length === 2`);
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-10-01');
      await evaluate(`${cards}[0].querySelector('button').click()`); await wait(`${rows}.length === 2`);
      assert.equal(await evaluate(`${header}.querySelector('h1').textContent`), '4 años EXPLORADORES');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= 320'), true);
    } finally { await ui.close(); }
  });
