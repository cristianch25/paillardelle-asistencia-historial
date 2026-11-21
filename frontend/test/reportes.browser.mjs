import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) test(`Ficha mensual ${role}: filtros mínimos, Blob descargable y móvil`, { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('reportsHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.reportsTest)'); await ui.evaluate(`reportsTest.role='${role}'`);
    await ui.login(); await ui.setRoute('/reportes');
    await ui.wait(`Boolean(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Descargar ficha' && !b.disabled))`);
    assert.equal(await ui.evaluate('document.querySelectorAll("select").length'), 0);
    assert.equal(await ui.evaluate('reportsTest.calls.length'), 0);
    assert.equal(await ui.evaluate(`Boolean(document.querySelector('nav a[href="/reportes"]'))`), true);
    await ui.evaluate(`(() => { const input=document.querySelector('input[type="month"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-03'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await ui.click('Descargar ficha'); await ui.wait('reportsTest.downloads.length === 1');
    assert.deepEqual(await ui.evaluate('reportsTest.calls'), [{ method: 'get', params: { anio_escolar_id: '10', seccion_id: '20', mes: '2026-03' } }]);
    assert.equal(await ui.evaluate('reportsTest.downloads[0].name'), 'asistencia-2026-03-seccion-20.pdf');
    await ui.wait('reportsTest.revoked.length === 1');
    assert.doesNotMatch(await ui.evaluate('document.querySelector("#main-content").textContent'), /Una hoja por sección|PDF preparado|Las celdas sin marca|Exportar PDF/);
    await ui.click('Imprimir ficha'); await ui.wait('reportsTest.prints.length === 1');
    assert.deepEqual(await ui.evaluate('reportsTest.calls[1]'), await ui.evaluate('reportsTest.calls[0]'));
    assert.equal(await ui.evaluate('reportsTest.downloads.length'), 1);
    assert.equal(await ui.evaluate('location.pathname'), '/reportes');
    assert.equal(await ui.evaluate('document.querySelectorAll("iframe").length'), 1);
    // Cancelar/cerrar el diálogo nativo notifica afterprint, sin alterar selecciones.
    await ui.evaluate(`document.querySelector('iframe').contentWindow.dispatchEvent(new Event('afterprint'))`);
    await ui.wait('!document.querySelector("iframe") && reportsTest.revoked.length === 2');
    assert.equal(await ui.evaluate('document.querySelector("input[type=month]").value'), '2026-03');
    for (const width of [1440, 412, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width === 320 });
      assert.ok(await ui.evaluate('document.documentElement.scrollWidth <= innerWidth'));
      const positions = await ui.evaluate(`['Imprimir ficha','Descargar ficha'].map(text=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text),r=b.getBoundingClientRect();return {top:r.top,left:r.left,width:r.width};})`);
      assert.equal(positions[0].top === positions[1].top, width >= 640);
      const screenshot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/reportes-${role}-${width}.png`, Buffer.from(screenshot.data, 'base64'));
    }
    assert.equal(await ui.evaluate('document.querySelectorAll("a[download]").length'), 0);
    await ui.click('Imprimir ficha'); await ui.wait('reportsTest.prints.length === 2');
    await ui.setRoute('/inicio'); await ui.wait('location.pathname === "/inicio" && !document.querySelector("iframe")');
    assert.equal(await ui.evaluate('reportsTest.revoked.length'), 3);
  } finally { await ui.close(); }
});

test('Ficha mensual: varias secciones, límite visible y ausencia de datos sin descargar', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('reportsHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.reportsTest)'); await ui.evaluate('reportsTest.multiple=true');
    await ui.login(); await ui.setRoute('/reportes'); await ui.wait('document.querySelectorAll("select option").length === 3');
    for (const label of ['Imprimir ficha', 'Descargar ficha']) assert.equal(await ui.evaluate(`${ui.button(label)}.disabled`), true);
    await ui.evaluate(`(() => { const input=document.querySelector('select'); input.value='21'; input.dispatchEvent(new Event('change',{bubbles:true})); reportsTest.fail=422; })()`);
    await ui.click('Descargar ficha'); await ui.wait('document.body.textContent.includes("supera los 30")');
    assert.equal(await ui.evaluate('reportsTest.downloads.length'), 0);
    await ui.evaluate('reportsTest.fail=0; reportsTest.printFails=true');
    await ui.click('Imprimir ficha'); await ui.wait('document.body.textContent.includes("No se pudo abrir la impresión")');
    assert.equal(await ui.evaluate('document.querySelectorAll("iframe").length'), 0);
    const month = await ui.evaluate('document.querySelector("input[type=month]").value');
    await ui.click('Descargar ficha'); await ui.wait('reportsTest.downloads.length === 1');
    assert.equal(await ui.evaluate('reportsTest.downloads[0].name'), `asistencia-${month}-seccion-21.pdf`);
    await ui.setRoute('/inicio'); await ui.wait('location.pathname === "/inicio"'); await ui.evaluate('reportsTest.empty=true');
    await ui.setRoute('/reportes'); await ui.wait('document.body.textContent.includes("No hay secciones autorizadas")');
    for (const label of ['Imprimir ficha', 'Descargar ficha']) assert.equal(await ui.evaluate(`${ui.button(label)}.disabled`), true);
  } finally { await ui.close(); }
});
