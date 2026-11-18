import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const role of ['ADMIN', 'SUBDIRECCION']) test(`${role}: celular temporal, original, validación, cancelar, concurrencia y móvil`, { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('importPreviewHarness.jsx'), { evaluate, wait, click } = ui;
  const row = 'document.querySelectorAll("tbody tr")[2]';
  async function input(value) {
    await evaluate(`(() => { const input = ${row}.querySelector('input[type=tel]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  }
  try {
    await ui.navigate('/login'); await wait('Boolean(window.importTest)'); await evaluate(`importTest.role='${role}'`); await ui.login();
    await ui.setRoute('/secciones/importar'); await wait('document.querySelectorAll("select")[1]?.options.length > 1');
    await evaluate(`(() => {
      const select=document.querySelectorAll('select')[1]; select.value='INICIAL'; select.dispatchEvent(new Event('change',{bubbles:true}));
      const date=document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2026-03-02'); date.dispatchEvent(new Event('change',{bubbles:true}));
      const file=document.querySelector('input[type=file]'), transfer=new DataTransfer(); transfer.items.add(new File(['ficticio'],'padron.xlsx')); file.files=transfer.files; file.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await click('Ver vista previa'); await wait('Boolean(document.querySelector("table"))');
    assert.equal(await evaluate('document.querySelectorAll("tbody tr")[3].textContent.includes("requiere revisión")'), true);
    assert.equal(await evaluate('document.querySelectorAll("tbody tr")[3].querySelectorAll("button").length'), 0);
    await click('Corregir celular'); await wait(`${row}.querySelector('input[type=tel]') !== null`);
    assert.equal(await evaluate(`${row}.textContent.includes('999123456 / 988123456')`), true);
    await input('899123456'); await click('Guardar corrección temporal'); await wait(`${row}.textContent.includes('empiece en 9')`);
    assert.equal(await evaluate('importTest.calls.filter(row=>row.method==="patch").length'), 0);
    await click('Cancelar'); assert.equal(await evaluate(`${row}.querySelector('input[type=tel]') === null`), true);
    await click('Corregir celular');
    await evaluate(`(() => { const select=${row}.querySelector('select'); select.value='988123456'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    for (const width of [320, 390]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    }
    await evaluate('importTest.phoneHold=true'); await click('Guardar corrección temporal'); await wait('importTest.pending.length === 1');
    assert.equal(await evaluate(`${row}.textContent.includes('Corrección temporal')`), false);
    await evaluate('importTest.phoneHold=false; importTest.pending.splice(0).forEach(resolve=>resolve())');
    await wait(`${row}.textContent.includes('Celular propuesto: 988123456') && !${row}.querySelector('input[type=tel]')`);
    assert.equal(await evaluate(`${row}.dataset.review`), 'ready');
    assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 19);
    await click('Siguiente'); await wait('document.querySelector("tbody").children.length === 5');
    await click('Anterior'); await wait(`${row}.textContent.includes('Celular propuesto: 988123456')`);
    await click('Corregir celular'); await input('+51 999 123 456'); await evaluate('importTest.phoneFail=true'); await click('Guardar corrección temporal');
    await wait('document.body.textContent.includes("La fila cambió")');
    assert.equal(await evaluate(`${row}.querySelector('input[type=tel]') !== null`), true);
    await click('Cancelar'); assert.equal(await evaluate(`${row}.textContent.includes('Celular propuesto: 988123456')`), true);
    await evaluate('importTest.phoneFail=false'); await click('Corregir celular'); await input(''); await click('Guardar corrección temporal');
    await wait(`${row}.textContent.includes('Celular propuesto: Sin celular')`);
    await click('Corregir celular'); assert.equal(await evaluate(`${row}.textContent.includes('999123456 / 988123456')`), true);
    assert.equal(await evaluate('importTest.calls.some(row=>["/estudiantes/","/confirmar","/matriculas"].some(path=>row.url.includes(path)))'), false);
  } finally { await ui.close(); }
});
