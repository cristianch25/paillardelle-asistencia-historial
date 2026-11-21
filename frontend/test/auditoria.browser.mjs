import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('Historial ADMIN: responsables, operaciones desconocidas, filtro servidor, páginas y móvil', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('auditHarness.jsx'), { evaluate, wait, click } = ui;
  const rows = `document.querySelectorAll('#main-content tbody tr')`;
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/auditoria');
    await wait(`${rows}.length === 20`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('th')).map(e=>e.textContent)`), ['Fecha y hora', 'Responsable', 'Actividad', 'Detalle']);
    assert.equal(await evaluate(`document.querySelector('nav a[href="/auditoria"]').textContent`), 'Historial de actividades');
    const text = await evaluate('document.querySelector("#main-content").textContent');
    assert.match(text, /Herramienta local de inicialización.*Cuenta de superusuario creada/);
    assert.match(text, /Responsable no disponible/); assert.match(text, /Sistema/);
    assert.match(text, /María Elena Ficticia.*Administración/); assert.match(text, /Actividad nueva/);
    assert.doesNotMatch(text, /@|admin_ficticio|cuenta_demo|Registro histórico de operaciones|#\d+/);
    // StrictMode puede repetir el efecto inicial; no hay consultas por cada fila.
    assert.ok(await evaluate('auditTest.calls.length <= 2 && auditTest.calls.every(call=>call.params.page==="1" && call.params.limit==="20")'));
    assert.equal(await evaluate(`Array.from(${rows}).find(e=>e.textContent.includes('María Elena')).querySelector('td:nth-child(2) p').title`), 'Nombre actual de la cuenta responsable');
    for (const width of [1280, 412, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await evaluate(`document.querySelector('table').parentElement.scrollWidth > document.querySelector('table').parentElement.clientWidth`), width < 640);
      const image = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/audit-${width}.png`, Buffer.from(image.data, 'base64'));
    }
    const visited = [];
    for (const page of [1, 2, 3]) {
      if (page > 1) { await click('Siguiente'); await wait(`auditTest.calls.at(-1).params.page==='${page}' && ${rows}.length===${page===3?5:20}`); }
      const ids = await evaluate(`Array.from(${rows}).map(row=>row.querySelector('td').textContent)`);
      visited.push(...ids);
    }
    assert.equal(visited.length, 45); assert.equal(new Set(visited).size, 45);
    await click('Anterior'); await wait(`auditTest.calls.at(-1).params.page==='2' && ${rows}.length===20`);
    await click('Actualizar'); await wait(`auditTest.calls.at(-1).params.page==='2' && ${rows}.length===20`);
    await evaluate(`(() => { const select=document.querySelector('#filtro-accion'); select.value='CREAR_SECCION'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await wait(`${rows}.length===8 && auditTest.calls.at(-1).params.page==='1'`);
    assert.equal(await evaluate('auditTest.calls.at(-1).params.accion'), 'CREAR_SECCION');
    assert.equal(await evaluate(`Array.from(${rows}).every(row=>row.textContent.includes('Sección creada'))`), true);
    await evaluate(`(() => { const select=document.querySelector('#filtro-accion'); select.value=''; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await wait(`${rows}.length===20 && !auditTest.calls.at(-1).params.accion`);
    assert.match(await evaluate('document.querySelector("#main-content").textContent'), /Actividad nueva/);
    await evaluate('auditTest.fail=true'); await click('Actualizar'); await wait('Boolean(document.querySelector("#main-content [role=alert]"))');
    assert.doesNotMatch(await evaluate('document.querySelector("#main-content [role=alert]").textContent'), /Detalle privado/);
    await evaluate('auditTest.fail=false; auditTest.empty=true'); await click('Actualizar');
    await wait('document.body.textContent.includes("No se encontraron actividades")');
    assert.equal(await evaluate('auditTest.calls.every(call=>call.method==="get")'), true);
  } finally { await ui.close(); }
});

for (const role of ['SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) test(`Historial permanece sin acceso para ${role}`, { skip: !hasEdge, timeout: 60000 }, async () => {
  const ui = await authBrowser('auditHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.wait('Boolean(window.auditTest)'); await ui.evaluate(`auditTest.role='${role}'`);
    await ui.login(role === 'SUPERUSUARIO' ? '/administradores' : '/inicio'); await ui.setRoute('/auditoria');
    await ui.wait(`location.pathname!=='/auditoria'`);
    assert.equal(await ui.evaluate('auditTest.calls.length'), 0);
    assert.equal(await ui.evaluate(`Boolean(document.querySelector('nav a[href="/auditoria"]'))`), false);
  } finally { await ui.close(); }
});
