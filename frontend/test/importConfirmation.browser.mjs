import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const role of ['ADMIN', 'SUBDIRECCION']) test(`SIAGIE ${role}: una confirmación, decisión expresa y recibo sin reescritura`,
  { skip: !hasEdge, timeout: 120000 }, async () => {
    const ui = await authBrowser('importConfirmationHarness.jsx');
    const { evaluate, wait, click, command } = ui;
    try {
      await ui.navigate('/login'); await wait('Boolean(window.importTest)'); await evaluate(`importTest.role = '${role}'`); await ui.login();
      await ui.setRoute('/secciones/importar'); await wait('document.querySelectorAll("select")[1]?.options.length > 1');
      await evaluate(`(() => {
        const level = document.querySelectorAll('select')[1]; level.value = 'INICIAL'; level.dispatchEvent(new Event('change', { bubbles: true }));
        const date = document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2026-03-02');
        date.dispatchEvent(new Event('change', { bubbles: true }));
        const input = document.querySelector('input[type=file]'), files = new DataTransfer(); files.items.add(new File(['fixture'], 'padron.xlsx'));
        input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await click('Ver vista previa'); await wait(`Boolean(document.querySelector('[aria-label="Confirmación de importación"]'))`);
      assert.equal(await evaluate(`${ui.button('Confirmar importación')}.disabled`), true);
      assert.match(await evaluate('document.body.textContent'), /afecta a otros estudiantes/);
      await evaluate(`(() => { const input = document.querySelector('[aria-label="Decisión para celular 1"]');
        input.value = '${role === 'ADMIN' ? 'ACTUALIZAR' : 'CONSERVAR'}'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      for (const width of [1440, 320]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 320 });
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
      }
      await evaluate(`document.querySelector('[aria-label="Confirmación de importación"]').scrollIntoView()`);
      const shot = await command('Page.captureScreenshot', { format: 'png' });
      await writeFile(`node_modules/.tmp/siagie-confirmation-${role}-320.png`, Buffer.from(shot.data, 'base64'));
      await click('Confirmar importación'); await wait(`Boolean(document.querySelector('[aria-label="Aceptar confirmación"]'))`);
      assert.equal(await evaluate('siagieConfirmationTest.calls.length'), 0);
      await evaluate(`siagieConfirmationTest.hold = true; siagieConfirmationTest.uncertain = ${role === 'ADMIN'}`);
      await click('Confirmar y guardar'); await wait('siagieConfirmationTest.pending.length === 1');
      assert.equal(await evaluate(`${ui.button('Confirmar y guardar')}.disabled`), true);
      assert.equal(await evaluate('document.querySelector("input[type=file]").matches(":disabled")'), true);
      await click('Confirmar y guardar'); assert.equal(await evaluate('siagieConfirmationTest.calls.length'), 1);
      await evaluate('siagieConfirmationTest.pending.shift()()');
      if (role === 'ADMIN') {
        await wait('document.body.textContent.includes("Resultado incierto")');
        await evaluate('siagieConfirmationTest.missing = true'); await click('Consultar resultado');
        await wait('document.body.textContent.includes("Todavía no hay una confirmación verificada")');
        assert.equal(await evaluate('siagieConfirmationTest.calls.filter(c => c.method === "post").length'), 1);
        await evaluate('siagieConfirmationTest.missing = false'); await click('Consultar resultado');
      }
      await wait('document.body.textContent.includes("Importación confirmada")');
      assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Resumen de importación"]').length`), 1);
      assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Resumen de importación"] dt').length`), 3);
      assert.doesNotMatch(await evaluate('document.body.textContent'), /9007199254741999|Existentes con propuesta|Matrículas propuestas|Ya existentes|Vínculos:/);
      assert.match(await evaluate('document.body.textContent'), /1 contactos necesitan revisión/);
      assert.equal(await evaluate('siagieConfirmationTest.calls.filter(c => c.method === "post").length'), 1);
      assert.equal(await evaluate('siagieConfirmationTest.calls[0].body.decisiones_telefono[0].decision'), role === 'ADMIN' ? 'ACTUALIZAR' : 'CONSERVAR');
      assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Aceptar confirmación"]'))`), false);
    } finally { await ui.close(); }
  });
