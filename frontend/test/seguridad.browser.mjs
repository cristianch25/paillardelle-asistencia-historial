import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('SUPERUSUARIO: Seguridad de solo lectura, paginación, móvil y Administradores conservado', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('securityHarness.jsx'), { evaluate, wait, click, command } = ui;
  const rows = `document.querySelectorAll('[aria-label="Eventos de seguridad"] > li')`;
  try {
    await ui.navigate('/login'); await ui.login('/administradores');
    await wait('document.body.textContent.includes("admin.ana")');
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("aside nav a")).map(e=>e.textContent.trim())'), ['Administradores', 'Seguridad']);
    await evaluate(`document.querySelector('aside a[href="/seguridad"]').click()`); await wait(`${rows}.length===20`);
    assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Seguridad');
    for (const label of ['Usuario creado', 'Usuario actualizado', 'Cuenta activada', 'Cuenta desactivada', 'Permisos de usuario actualizados']) {
      assert.ok(await evaluate(`document.querySelector('#main-content').textContent.includes(${JSON.stringify(label)})`));
    }
    assert.match(await evaluate('document.querySelector("#main-content").textContent'), /Herramienta local de inicialización.*Cuenta ficticia 0/);
    assert.equal(await evaluate('document.querySelectorAll("#main-content input,#main-content select,#main-content textarea").length'), 0);
    const names = [];
    for (const page of [1, 2, 3]) {
      if (page > 1) { await click('Siguiente'); await wait(`securityTest.calls.at(-1).params.page===${page} && ${rows}.length===${page===3?2:20}`); }
      names.push(...await evaluate(`Array.from(${rows}).map(e=>e.querySelectorAll('dd')[1].textContent)`));
    }
    assert.equal(names.length, 42); assert.equal(new Set(names).size, 42);
    await click('Anterior'); await wait(`${rows}.length===20`);
    for (const width of [1280, 412, 320]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/security-${width}.png`, Buffer.from(shot.data, 'base64'));
    }
    assert.ok(await evaluate('securityTest.calls.every(c=>c.method==="get")'));
    assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Iniciar sesión|Acceso denegado|Sincronización|Editar|Eliminar|Guardar/);
    await evaluate('securityTest.fail=true'); await click('Anterior');
    await wait('Boolean(document.querySelector("#main-content [role=alert]"))');
    assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Error técnico privado/);
    await evaluate('securityTest.fail=false;securityTest.empty=true'); await click('Reintentar consulta');
    await wait('document.body.textContent.includes("No hay eventos de seguridad registrados")');
    await ui.setRoute('/administradores'); await wait('document.body.textContent.includes("admin.ana")');
    assert.ok(await evaluate('superTest.calls.every(c=>c.method==="get" && c.url==="/usuarios")'));
  } finally { await ui.close(); }
});

for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) test(`Seguridad deniega URL directa y menú a ${role}`, { skip: !hasEdge, timeout: 60000 }, async () => {
  const ui = await authBrowser('securityHarness.jsx');
  try {
    await ui.navigate(`/login?role=${role}`); await ui.login(); await ui.setRoute('/seguridad');
    await ui.wait('location.pathname==="/inicio"');
    assert.equal(await ui.evaluate('securityTest.calls.length'), 0);
    assert.equal(await ui.evaluate(`Boolean(document.querySelector('aside a[href="/seguridad"]'))`), false);
  } finally { await ui.close(); }
});
