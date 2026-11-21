import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

async function fill(ui, values) {
  for (const [name, value] of Object.entries(values)) await ui.evaluate(`(() => {
    const input = document.querySelector('input[name="${name}"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
}

test('Años ADMIN: tres campos, creación, confirmaciones, límite de fecha y diseño móvil', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('schoolYearsHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/anios-escolares');
    await ui.wait(`document.querySelectorAll('article').length === 2`);
    assert.equal(await ui.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Consultar años')`), false);
    assert.doesNotMatch(await ui.evaluate('document.querySelector("#main-content").textContent'), /Administra los años escolares|Las cuentas de usuarios, identidades de estudiantes/);
    assert.equal(await ui.evaluate(`Boolean(document.querySelector('nav a[href="/anios-escolares"]'))`), true);
    assert.equal(await ui.evaluate(`document.querySelector('article[aria-label="Año escolar 2200"] button').disabled`), true);
    assert.match(await ui.evaluate(`document.querySelector('article[aria-label="Año escolar 2200"]').textContent`), /Podrás cerrar el año escolar a partir del 1 de enero de 2201\./);
    await ui.click('Crear año escolar');
    const formText = await ui.evaluate('document.querySelector("form").textContent');
    assert.match(formText, /Indica la fecha de inicio y de finalización del año escolar\./);
    assert.match(formText, /El nuevo año quedará preparado para su apertura\./);
    assert.doesNotMatch(formText, /Las fechas se configuran una sola vez|sin secciones, matrículas ni sesiones propias/);
    assert.deepEqual(await ui.evaluate(`Array.from(document.querySelectorAll('form input')).map(el=>el.name)`), ['anio', 'fecha_inicio', 'fecha_fin']);
    await fill(ui, { anio: '2027', fecha_inicio: '2027-01-01', fecha_fin: '2027-12-31' }); await ui.click('Crear año');
    await ui.wait(`document.querySelectorAll('article').length === 3`);
    assert.equal(await ui.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Consultar años')`), false);
    assert.deepEqual(await ui.evaluate(`JSON.parse(yearsTest.calls.find(c=>c.method==='post').body)`), { anio: 2027, fecha_inicio: '2027-01-01', fecha_fin: '2027-12-31' });
    await ui.evaluate(`document.querySelector('article[aria-label="Año escolar 2000"] button').click()`);
    await ui.wait(`Boolean(document.querySelector('dialog[open]'))`);
    assert.equal(await ui.evaluate(`yearsTest.calls.filter(c=>c.method==='patch').length`), 0);
    await ui.click('Cancelar'); await ui.wait(`!document.querySelector('dialog[open]')`);
    assert.equal(await ui.evaluate(`yearsTest.calls.filter(c=>c.method==='patch').length`), 0);
    await ui.evaluate(`document.querySelector('article[aria-label="Año escolar 2000"] button').click()`); await ui.click('Confirmar apertura');
    await ui.wait(`!document.querySelector('dialog[open]') && document.querySelector('article[aria-label="Año escolar 2000"]')?.textContent.includes('ABIERTO')`);
    assert.doesNotMatch(await ui.evaluate(`document.querySelector('article[aria-label="Año escolar 2000"]').textContent`), /Podrás cerrar/);
    await ui.evaluate(`document.querySelector('article[aria-label="Año escolar 2000"] button').click()`); await ui.wait(`Boolean(document.querySelector('dialog[open]'))`);
    assert.ok((await ui.evaluate('document.querySelector("dialog[open]").textContent')).includes('No hay reapertura'));
    await ui.click('Confirmar cierre');
    await ui.wait(`!document.querySelector('dialog[open]') && document.querySelector('article[aria-label="Año escolar 2000"]')?.textContent.includes('CERRADO')`);
    assert.equal(await ui.evaluate(`document.querySelectorAll('article[aria-label="Año escolar 2000"] button').length`), 0);
    for (const width of [1440, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width === 320 });
      assert.ok(await ui.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    }
    assert.equal(await ui.evaluate(`yearsTest.calls.filter(c=>c.method==='patch').length`), 2);
    await ui.setRoute('/inicio'); await ui.wait('location.pathname === "/inicio"');
    await ui.evaluate(`yearsTest.years.find(year=>year.anio===2200).fecha_fin='2200-12-18'`);
    await ui.setRoute('/anios-escolares'); await ui.wait(`document.querySelectorAll('article').length === 3`);
    assert.match(await ui.evaluate(`document.querySelector('article[aria-label="Año escolar 2200"]').textContent`), /Podrás cerrar el año escolar a partir del 19 de diciembre de 2200\./);
  } finally { await ui.close(); }
});

for (const role of ['SUBDIRECCION', 'REGISTRADOR']) test(`Años ${role}: sin menú ni consulta administrativa`, { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('schoolYearsHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.yearsTest)'); await ui.evaluate(`yearsTest.role='${role}'`);
    await ui.login();
    // Inicio de SUBDIRECCION consulta años; esperar esa lectura antes de medir el acceso administrativo.
    if (role === 'SUBDIRECCION') await ui.wait('yearsTest.calls.some(call=>call.method==="get")');
    const before = await ui.evaluate('yearsTest.calls.length'); await ui.setRoute('/anios-escolares');
    await ui.wait('document.body.textContent.includes("reservada a ADMIN")');
    assert.equal(await ui.evaluate(`Boolean(document.querySelector('nav a[href="/anios-escolares"]'))`), false);
    assert.equal(await ui.evaluate('yearsTest.calls.length'), before);
  } finally { await ui.close(); }
});

test('Años: conflicto visible y fallo incierto exige consultar antes de reintentar', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('schoolYearsHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/anios-escolares'); await ui.wait(`document.querySelectorAll('article').length === 2`);
    await ui.click('Crear año escolar'); await fill(ui, { anio: '2000', fecha_inicio: '2000-01-01', fecha_fin: '2000-12-31' }); await ui.click('Crear año');
    await ui.wait('document.body.textContent.includes("ya está registrado")');
    await fill(ui, { anio: '2027' }); await ui.evaluate('yearsTest.fail=500'); await ui.click('Crear año');
    await ui.wait('document.body.textContent.includes("No se pudo confirmar")');
    assert.equal(await ui.evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
    const before = await ui.evaluate(`yearsTest.calls.filter(c=>c.method==='post').length`);
    await ui.click('Crear año'); assert.equal(await ui.evaluate(`yearsTest.calls.filter(c=>c.method==='post').length`), before);
    await ui.evaluate('yearsTest.fail=0'); await ui.click('Consultar años'); await ui.wait('!document.querySelector("form")');
    await ui.wait(`!Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Crear año escolar').disabled`);
    assert.equal(await ui.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Consultar años')`), false);
  } finally { await ui.close(); }
});
