import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('6B.3: confirmación de cierre, borrador, exclusión de guardado y móvil',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, button, rows, command } = ui;
    const modal = `document.querySelector('[aria-label="Cierre de asistencia"] dialog[open]')`;
    const closes = () => evaluate('navigationTest.calls.filter(c => c.url.endsWith("/cierre"))');
    const open = async () => { await click('Cerrar asistencia'); await wait(`Boolean(${modal})`); };
    const confirmed = () => wait('document.body.textContent.includes("Cierre de asistencia confirmado")');
    try {
      await t.test('cancelar no cierra ni cambia estados; pendientes vienen de la base confirmada', async () => {
        await ui.prepare(); await open();
        assert.match(await evaluate(`${modal}.textContent`), /Hay 1 estudiante sin marcar/);
        await click('Cancelar'); await wait(`!${modal}`);
        assert.equal((await closes()).length, 0); assert.equal(await evaluate(`${rows}.length`), 4);
        assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'PENDIENTE');
      });
      await t.test('cierre exitoso con pendientes conserva el padrón, muestra advertencias y retira acciones', async () => {
        await open(); await click('Confirmar cierre'); await confirmed();
        assert.deepEqual((await closes()).map(c => c.body), [{ version: 7 }]);
        assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'PENDIENTE');
        assert.match(await evaluate('document.body.textContent'), /Sesión cerrada.*Solo consulta/);
        assert.match(await evaluate('document.body.textContent'), /Sin marcar al cerrar: 1\. Permanecen pendientes/);
        assert.equal(await evaluate(`${rows}.length`), 4);
        for (const label of ['Cerrar asistencia', 'Guardar avances', 'Abrir asistencia', 'Marcar todos como presentes']) {
          assert.equal(await evaluate(`Boolean(${button(label)})`), false);
        }
        assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 0);
      });
      await t.test('borrador: volver conserva marcas; descarte requiere checkbox y no envía PATCH', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente'); await open();
        assert.match(await evaluate(`${modal}.textContent`), /Hay 1 estudiante sin marcar/);
        assert.equal(await evaluate(`${button('Confirmar cierre')}.disabled`), true);
        await click('Volver y guardar'); await wait(`!${modal}`); assert.equal(await ui.dirty(), 1);
        assert.equal((await closes()).length, 0);
        await open(); await evaluate(`${modal}.querySelector('input[type=checkbox]').click()`);
        await click('Confirmar cierre'); await confirmed();
        assert.equal(await ui.dirty(), 0); assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'PENDIENTE');
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 0);
        assert.deepEqual((await closes())[0].body, { version: 7 });
      });
      await t.test('guardar y después cerrar utiliza la nueva versión y no inventa advertencias', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente'); await ui.save(); await open();
        assert.match(await evaluate(`${modal}.textContent`), /Hay 0 estudiantes sin marcar/);
        await click('Confirmar cierre'); await confirmed();
        assert.deepEqual((await closes())[0].body, { version: 8 });
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Sin marcar al cerrar:/);
      });
      await t.test('PATCH bloquea cierre; cierre bloquea edición, navegación y doble clic', async () => {
        await ui.prepare(); await ui.choose(0, 'Falta');
        await evaluate('navigationTest.holdPatch = true'); await click('Guardar avances'); await wait('Boolean(navigationTest.releasePatch)');
        assert.equal(await evaluate(`${button('Cerrar asistencia')}.disabled`), true);
        await click('Cerrar asistencia'); assert.equal((await closes()).length, 0); assert.equal(await evaluate(`Boolean(${modal})`), false);
        await evaluate('navigationTest.releasePatch()'); await wait('document.body.textContent.includes("Avances guardados correctamente")');
        await evaluate('navigationTest.holdClose = true'); await open();
        await evaluate(`const confirm = ${button('Confirmar cierre')}; confirm.click(); confirm.click()`);
        await wait('Boolean(navigationTest.releaseClose)');
        assert.equal((await closes()).length, 1);
        assert.equal(await evaluate(`${rows}.every(row => Array.from(row.querySelectorAll('button')).every(b => b.disabled))`), true);
        assert.equal(await evaluate(`${button('Guardar avances')}.disabled`), true);
        await ui.menu('/inicio'); await ui.guard();
        assert.equal(await evaluate(`${button('Salir sin guardar')}.disabled`), true);
        await ui.cancel(); await evaluate('navigationTest.releaseClose()'); await confirmed();
      });
      await t.test('320 px: acción visible al final, diálogo accesible, foco, Escape y controles táctiles', async () => {
        await ui.prepare();
        await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
        await evaluate(`${button('Cerrar asistencia')}.scrollIntoView({ block: 'center' })`);
        assert.ok(await evaluate(`(() => { const r = ${button('Cerrar asistencia')}.getBoundingClientRect();
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === ${button('Cerrar asistencia')}; })()`));
        await open(); assert.equal(await evaluate('document.activeElement.textContent'), 'Cancelar');
        assert.ok(await evaluate(`document.documentElement.scrollWidth <= 320 && ${modal}.getBoundingClientRect().left >= 0`));
        assert.ok(await evaluate(`Array.from(${modal}.querySelectorAll('button')).every(b => b.getBoundingClientRect().height >= 44)`));
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await wait(`Boolean(${modal}) && ${modal}.contains(document.activeElement)`);
        if (await evaluate('document.activeElement.textContent === "Cancelar"')) {
          await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        }
        assert.equal(await evaluate('document.activeElement.textContent'), 'Confirmar cierre');
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate('document.activeElement.textContent'), 'Cancelar');
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await wait(`!${modal}`); await wait('document.activeElement.textContent === "Cerrar asistencia"');
        assert.equal((await closes()).length, 0);
      });
    } finally { await ui.close(); }
  });
