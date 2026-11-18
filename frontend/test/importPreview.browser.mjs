import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const role of ['ADMIN', 'SUBDIRECCION']) test(`SIAGIE ${role}: móvil, filtros, selección y paginación sin escrituras`, { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('importPreviewHarness.jsx'); const { evaluate, wait, click } = ui;
  try {
    await ui.navigate('/login'); await wait('Boolean(window.importTest)'); await evaluate(`importTest.role = '${role}'`); await ui.login();
    await ui.setRoute('/secciones/importar'); await wait('Boolean(document.querySelector("input[type=file]")) && document.querySelectorAll("select")[1].options.length > 1');
    assert.equal(await evaluate('document.querySelectorAll("select")[1].options.length'), role === 'ADMIN' ? 4 : 2);
    await evaluate(`(() => {
      const select = document.querySelectorAll('select')[1]; select.value='INICIAL'; select.dispatchEvent(new Event('change', {bubbles:true}));
      const date = document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2026-03-02'); date.dispatchEvent(new Event('change',{bubbles:true}));
      const input = document.querySelector('input[type=file]'), transfer = new DataTransfer(); transfer.items.add(new File(['ficticio'],'padron.xlsx')); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await click('Ver vista previa'); await wait('Boolean(document.querySelector("table"))');
    assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 19);
    assert.equal(await evaluate('document.querySelector("input[type=checkbox]").disabled'), true);
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("tbody tr")).slice(0,3).map(row=>row.dataset.review)'), ['blocked', 'ready', 'warning']);
    assert.equal(await evaluate('new Set(Array.from(document.querySelectorAll("tbody tr")).slice(0,3).map(row=>getComputedStyle(row).backgroundColor)).size'), 3);
    await evaluate('document.querySelectorAll("input[type=checkbox]")[1].click()');
    await wait('importTest.selected.length === 23 && !document.querySelectorAll("input[type=checkbox]")[1].disabled');
    await click('Siguiente'); await wait('document.querySelector("tbody").children.length === 5');
    await click('Anterior'); await wait('document.querySelectorAll("input[type=checkbox]:checked").length === 18');
    await evaluate('document.querySelectorAll("input[type=checkbox]")[1].click()');
    await wait('importTest.selected.length === 24 && document.querySelectorAll("input[type=checkbox]:checked").length === 19');
    for (const width of [1280, 320, 390]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    }
    assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).some(e=>/Guardar|Confirmar|Importar datos/.test(e.textContent))'), false);
    await evaluate('importTest.fail = true'); await click('Ver vista previa');
    await wait('document.body.textContent.includes("El nivel real del archivo")');
    assert.equal(await evaluate('Boolean(document.querySelector("table"))'), false);
    assert.equal(await evaluate('importTest.calls.some(row=>/confirmar|matriculas|telefono/.test(row.url))'), false);
  } finally { await ui.close(); }
});

test('REGISTRADOR no accede a la pantalla ni solicita la API de importación', { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('importPreviewHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.importTest)'); await ui.evaluate("importTest.role = 'REGISTRADOR'"); await ui.login();
    await ui.setRoute('/secciones/importar'); await ui.wait('document.body.textContent.includes("No tienes acceso al importador")');
    assert.equal(await ui.evaluate('importTest.calls.length'), 0);
  } finally { await ui.close(); }
});
