import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('6B.2C: navegación, historial, fecha y logout',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, command, dialog, rows } = ui;
    try {
      await t.test('sin diferencias se navega sin interrupciones', async () => {
        await ui.prepare(); await ui.menu('/inicio'); await wait('location.pathname === "/inicio"');
        assert.equal(await evaluate(`Boolean(${dialog})`), false);
      });
      await t.test('menú móvil y Volver: cancelar conserva; confirmar descarta', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente'); await ui.menu('/inicio'); await ui.guard();
        assert.match(await evaluate(`${dialog}.textContent`), /¿Salir sin guardar los cambios\?.*Tienes cambios de asistencia pendientes/);
        await ui.cancel(); assert.equal(await ui.dirty(), 1);
        await click('Volver a asistencias'); await ui.guard(); await ui.cancel();
        assert.equal(await evaluate('location.pathname'), '/asistencias/diaria');
        await ui.menu('/asistencias'); await ui.guard(); await ui.confirm(); await wait('location.pathname === "/asistencias"');
        await wait(`Boolean(document.querySelector('button[aria-label^="Asistencia diaria de 4"]'))`);
        await evaluate(`document.querySelector('button[aria-label^="Asistencia diaria de 4"]').click()`);
        await wait('location.pathname === "/asistencias/diaria"'); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
        assert.equal(await ui.dirty(), 0);
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 0);
      });
      await t.test('Atrás y Adelante conservan su destino después de cancelar o confirmar', async () => {
        await ui.prepare(); await ui.choose(0, 'Falta'); await evaluate('history.back()'); await ui.guard();
        await ui.cancel(); assert.equal(await evaluate('location.pathname'), '/asistencias/diaria');
        await evaluate('history.back()'); await ui.guard(); await ui.confirm(); await wait('location.pathname === "/asistencias"');
        await evaluate('history.forward()'); await wait('location.pathname === "/asistencias/diaria"');
        await ui.menu('/inicio'); await wait('location.pathname === "/inicio"');
        await evaluate('history.back()'); await wait('location.pathname === "/asistencias/diaria"');
        await click('Abrir asistencia'); await wait(`${rows}.length === 4`); await ui.choose(0, 'Tardanza');
        await evaluate('history.forward()'); await ui.guard(); await ui.cancel(); assert.equal(await ui.dirty(), 1);
        await evaluate('history.forward()'); await ui.guard(); await ui.confirm(); await wait('location.pathname === "/inicio"');
      });
      await t.test('menú de escritorio conserva borrador al cancelar', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente');
        await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        await evaluate(`document.querySelector('aside a[href="/inicio"]').click()`); await ui.guard(); await ui.cancel();
        assert.equal(await ui.dirty(), 1);
        await evaluate(`document.querySelector('a[href="#main-content"]').click()`);
        assert.equal(await evaluate('location.hash'), '');
        assert.equal(await evaluate('document.activeElement.id'), 'main-content');
        assert.equal(await evaluate(`Boolean(${dialog})`), false);
        await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      });
      await t.test('cambiar fecha requiere confirmar y vuelve a ofrecer apertura sin POST automático', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente'); await ui.setDate('2026-11-12'); await ui.guard(); await ui.cancel();
        assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-11-13');
        assert.equal(await ui.dirty(), 1);
        assert.equal(await evaluate('Boolean(document.querySelector("button[aria-describedby=opening-hint]"))'), false);
        const posts = await evaluate('navigationTest.calls.filter(c => c.method === "post").length');
        await ui.setDate('2026-11-12'); await ui.guard(); await ui.confirm();
        await wait(`${rows}.length === 4 && document.querySelector('input[type=date]').value === '2026-11-12'`);
        assert.equal(await evaluate('Boolean(document.querySelector("button[aria-describedby=opening-hint]"))'), false);
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "post").length'), posts);
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 0);
      });
      await t.test('diálogo a 320 px: foco, Tab, Escape y controles táctiles', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente'); await ui.menu('/inicio'); await ui.guard();
        await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
        assert.equal(await evaluate('document.activeElement.textContent'), 'Continuar registrando');
        const sizes = await evaluate(`({ width: document.documentElement.scrollWidth, right: ${dialog}.getBoundingClientRect().right,
          left: ${dialog}.getBoundingClientRect().left, heights: Array.from(${dialog}.querySelectorAll('button')).map(b => b.getBoundingClientRect().height) })`);
        assert.ok(sizes.width <= 320 && sizes.left >= 0 && sizes.right <= 320);
        assert.ok(sizes.heights.every(height => height >= 44));
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile('node_modules/.tmp/navigation-dialog-320.png', Buffer.from(screenshot.data, 'base64'));
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate('document.activeElement.textContent'), 'Salir sin guardar');
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate('document.activeElement.textContent'), 'Continuar registrando');
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await wait(`!${dialog}`); assert.equal(await ui.dirty(), 1);
      });
      await t.test('logout voluntario cancelado conserva autenticación y borrador; confirmado elimina ambos', async () => {
        await click('Cerrar sesión'); await ui.guard(); await ui.cancel(); assert.equal(await ui.dirty(), 1);
        assert.equal(await evaluate('sessionStorage.getItem("paillardelle.auth") !== null'), true);
        await click('Cerrar sesión'); await ui.guard(); await ui.confirm(); await wait('location.pathname === "/login"');
        assert.equal(await evaluate('sessionStorage.getItem("paillardelle.auth") === null'), true);
      });
    } finally { await ui.close(); }
  });
