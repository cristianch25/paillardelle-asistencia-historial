import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';
import { writeFile } from 'node:fs/promises';

test('móvil: buscar entre salones, guardar Tardanza y continuar sin duplicados ni sobrescritura',
  { skip: !hasEdge, timeout: 120000 }, async () => {
    const ui = await authBrowser('mobileAttendanceHarness.jsx');
    const { evaluate, wait, click, command } = ui;
    const hits = `document.querySelectorAll('[aria-label="Coincidencias de mis estudiantes"] li button')`;
    const cards = `document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li')`;
    const rows = `document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li')`;
    async function field(type, value) {
      await evaluate(`(() => { const field = document.querySelector('input[type=${type}]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)});
        field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    const writes = () => evaluate('mobileTest.calls.filter(call => ["post","patch"].includes(call.method)).length');
    const back = () => evaluate('document.querySelector("#main-content header a").click()');
    try {
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await ui.navigate('/login'); await ui.login(); await ui.setRoute('/asistencias');
      await wait(`${cards}.length === 2`);
      assert.equal(await evaluate(`${hits}.length`), 0); assert.equal(await writes(), 0);
      await field('search', 'mari pere'); await wait(`${hits}.length === 2`);
      assert.match(await evaluate(`${hits}[0].textContent`), /Pérez Ríos Ana María.*CREATIVOS/);
      assert.match(await evaluate(`${hits}[1].textContent`), /GENIALES/);
      await evaluate(`${hits}[1].click()`);
      await wait(`Boolean(document.querySelector('dialog[open] ul[aria-label="Asistencia rápida"] button[aria-pressed]'))`);
      assert.equal(await writes(), 0);
      await click('Tardanza'); assert.equal(await writes(), 0);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= 320'), true);
      for (const width of [320, 375, 768, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: width < 768 });
        assert.equal(await evaluate('document.querySelector("dialog[open]").scrollWidth <= document.querySelector("dialog[open]").clientWidth'), true);
        if (width === 320) {
          const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile('node_modules/.tmp/mobile-quick-320.png', Buffer.from(shot.data, 'base64'));
        }
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
      await click('Guardar cambios'); await wait('!document.querySelector("dialog[open]") && document.body.textContent.includes("Asistencia guardada")');
      assert.equal(await writes(), 2);
      await wait(`${cards}[1].textContent.includes('Tardanzas1')`);
      await evaluate(`${cards}[1].querySelector('button').click()`); await wait(`${rows}.length === 2`);
      assert.equal(await evaluate('Boolean(document.querySelector("button[aria-describedby=opening-hint]"))'), false);
      assert.equal(await writes(), 2);
      assert.match(await evaluate(`${rows}[0].textContent`), /Tardanza/);
      await evaluate(`Array.from(${rows}[1].querySelectorAll('button')).find(button => button.textContent.trim() === 'Presente').click()`);
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      assert.deepEqual(await evaluate('Object.values(mobileTest.stores)[0].padron.map(row => [row.estado,row.version])'), [['TARDANZA', 1], ['PRESENTE', 1]]);
      assert.equal(await evaluate('mobileTest.history.length'), 2);
      await back(); await wait(`${cards}.length === 2`); await field('date', '2026-10-01');
      await evaluate(`${cards}[1].querySelector('button').click()`); await wait(`${rows}.length === 2 && ${rows}[0].textContent.includes('Sin marcar')`);
      assert.equal(await writes(), 3);
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(button => button.textContent.trim() === 'Falta').click()`);
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      assert.equal(await writes(), 5);
      await back(); await wait(`${cards}.length === 2`);
      await evaluate("mobileTest.blocked.push('2026-10-02')"); await field('date', '2026-10-02');
      await evaluate(`${cards}[1].querySelector('button').click()`);
      await wait('document.body.textContent.includes("Hoy no hay clases")');
      assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 0);
      assert.doesNotMatch(await evaluate('document.body.textContent'), /Guardar cambios|Marcar todos/);
      await back(); await wait(`${cards}.length === 2`); await field('date', '2026-12-01');
      await evaluate(`${cards}[1].querySelector('button').click()`); await wait('document.body.textContent.includes("fecha futura")');
      assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 0); assert.equal(await writes(), 5);
      await back(); await wait(`${cards}.length === 2`);
      await evaluate("mobileTest.allowed = ['2']"); await field('search', 'pere');
      await wait(`${hits}.length === 2`);
      assert.equal(await evaluate(`Array.from(${hits}).some(hit => hit.textContent.includes('GENIALES'))`), false);
      await ui.setRoute('/secciones'); await wait(`${cards}.length === 1`); await click('Ver estudiantes');
      await wait('document.body.textContent.includes("2 estudiantes en esta fecha")');
      assert.doesNotMatch(await evaluate('document.body.textContent'), /Fecha de consulta|Año escolar|Asistencia diaria|Detalles/);
      assert.equal(await evaluate('document.querySelectorAll("input[type=date]").length'), 0);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= 320'), true);
    } finally { await ui.close(); }
  });
