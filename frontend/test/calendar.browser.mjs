import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) test(`Calendario visual ${role}: permisos, excepciones y actualización`, { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('calendarHarness.jsx');
  const { evaluate, click, wait } = ui;
  try {
    await ui.navigate('/login'); await wait('Boolean(window.calendarTest)'); await evaluate(`calendarTest.role = '${role}'`); await ui.login();
    assert.equal(await evaluate(`Boolean(document.querySelector('nav a[href="/calendario"]'))`), role !== 'REGISTRADOR');
    await ui.setRoute('/calendario');
    if (role === 'REGISTRADOR') {
      await wait('document.body.textContent.includes("No tienes acceso a la gestión")'); assert.equal(await evaluate('calendarTest.calls.length'), 0); return;
    }
    await wait(`document.querySelectorAll('section[aria-label^="Calendario de"] button').length === 31`);
    assert.equal(await evaluate(`document.querySelectorAll('select').length`), 1); // Un solo año: sin selector de año.
    assert.equal(await evaluate(`Array.from(document.querySelector('select').options).filter(o=>o.value).length`), role === 'ADMIN' ? 4 : 2);
    if (role === 'ADMIN') assert.equal(await evaluate(`document.querySelector('select').value`), 'TODOS');
    else await evaluate(`(() => { const level = document.querySelector('select'); level.value = 'SECUNDARIA'; level.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await wait(`Boolean(document.querySelector('button[aria-label="07/03/2026: No lectivo"]'))`);
    async function edit(date, value, description = '') {
      await evaluate(`document.querySelector('button[aria-label^="${date}:"]').click()`); await wait('Boolean(document.querySelector("dialog[open] select"))');
      await evaluate(`(() => {const select=document.querySelector('dialog[open] select'); select.value='${value}'; select.dispatchEvent(new Event('change',{bubbles:true}));
        const input=document.querySelector('dialog[open] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(description)}); input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('Revisar cambio'); await click('Confirmar y guardar');
    }
    await edit('07/03/2026', true); await wait(`Boolean(document.querySelector('button[aria-label^="07/03/2026: Lectivo"]'))`);
    await edit('10/03/2026', false, 'Feriado'); await wait(`Boolean(document.querySelector('button[aria-label="10/03/2026: No lectivo · Feriado"]'))`);
    await click('Actualizar'); await wait(`Boolean(document.querySelector('button[aria-label="10/03/2026: No lectivo · Feriado"]'))`);
    await edit('03/03/2026', false); await wait('document.body.textContent.includes("tiene sesiones de asistencia")'); await click('Cancelar');
    assert.ok(await evaluate(`Boolean(document.querySelector('button[aria-label="03/03/2026: Lectivo"]'))`));
    await evaluate(`document.querySelector('button[aria-label="Mes siguiente"]').click()`);
    await wait('document.body.textContent.includes("abril de 2026")');
    await evaluate(`document.querySelector('button[aria-label="Mes anterior"]').click()`);
    await wait(`Boolean(document.querySelector('button[aria-label="10/03/2026: No lectivo · Feriado"]'))`);
    for (const width of [1440, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width === 320 });
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
      if (width === 1440) { const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        await writeFile(`node_modules/.tmp/calendar-${role}.png`, Buffer.from(shot.data, 'base64')); }
    }
    assert.equal(await evaluate('calendarTest.calls.filter(c=>c.method === "put").length'), 3);
    if (role === 'ADMIN') {
      for (const level of ['INICIAL', 'PRIMARIA', 'SECUNDARIA']) {
        assert.equal(await evaluate(`calendarTest.exceptions['${level}:2026-03-10'].es_lectivo`), false);
        assert.equal(await evaluate(`Boolean(calendarTest.exceptions['${level}:2026-03-03'])`), false);
      }
    }
  } finally { await ui.close(); }
});

for (const [principal, allowed, label] of [['SECUNDARIA', ['SECUNDARIA'], 'Secundaria'], ['PRIMARIA', ['INICIAL', 'PRIMARIA'], 'Inicial y Primaria']]) {
  test(`Alcance único ${label}: sin selectores redundantes`, { skip: !hasEdge, timeout: 90000 }, async () => {
    const ui = await authBrowser('calendarHarness.jsx');
    try {
      await ui.navigate('/login'); await ui.wait('Boolean(window.calendarTest)');
      await ui.evaluate(`Object.assign(calendarTest,{role:'SUBDIRECCION',principal:'${principal}',allowed:${JSON.stringify(allowed)}})`);
      await ui.login(); await ui.setRoute('/calendario');
      await ui.wait(`document.querySelectorAll('section[aria-label^="Calendario de"] button').length === 31`);
      assert.equal(await ui.evaluate('document.querySelectorAll("select").length'), 0);
      assert.ok((await ui.evaluate('document.body.textContent')).includes(label));
    } finally { await ui.close(); }
  });
}

test('Calendario de año cerrado permanece consultable sin permitir edición', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('calendarHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.calendarTest)');
    await ui.evaluate("calendarTest.closed = true"); await ui.login(); await ui.setRoute('/calendario');
    await ui.wait('document.body.textContent.includes("Año cerrado")');
    await ui.wait(`document.querySelectorAll('section[aria-label^="Calendario de"] button').length === 31`);
    assert.equal(await ui.evaluate(`Array.from(document.querySelectorAll('section[aria-label^="Calendario de"] button')).every(button=>button.disabled)`), true);
    assert.equal(await ui.evaluate('calendarTest.calls.filter(call=>call.method === "put").length'), 0);
  } finally { await ui.close(); }
});

test('Con varios años conserva selector y carga el año elegido', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('calendarHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.calendarTest)'); await ui.evaluate('calendarTest.multipleYears = true');
    await ui.login(); await ui.setRoute('/calendario');
    await ui.wait(`document.querySelectorAll('section[aria-label^="Calendario de"] button').length === 31`);
    assert.equal(await ui.evaluate('document.querySelectorAll("select").length'), 2);
    await ui.evaluate(`(() => {const input=document.querySelector('select'); input.value='11'; input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await ui.wait('document.body.textContent.includes("Año cerrado")');
    await ui.wait(`calendarTest.calls.some(call => call.url === '/calendario-lectivo' && call.params.anio_escolar_id === '11')`);
  } finally { await ui.close(); }
});
