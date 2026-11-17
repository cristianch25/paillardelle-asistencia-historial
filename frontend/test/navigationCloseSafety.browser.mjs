import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath, waitFor } from './support/edgeBrowser.mjs';

test('6B.4B: navegación, salida nativa y autenticación durante guardado pendiente',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, command, dialog, button, rows } = ui;
    const prevented = () => evaluate('(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()');
    const patches = () => evaluate('navigationTest.calls.filter(c => c.method === "patch").length');
    async function save() {
      await ui.choose(0, 'Presente'); await click('Guardar cambios');
    }
    try {
      await t.test('F5, cierre de pestaña y salida del documento advierten durante guardado', async () => {
        await ui.prepare(); await command('Page.enable');
        await ui.touchMark(); await ui.choose(0, 'Sin marcar'); assert.equal(await ui.dirty(), 0);
        await evaluate('navigationTest.holdPatch = true'); await save(); await wait('Boolean(navigationTest.releasePatch)');
        assert.equal(await prevented(), true);
        const events = [], off = ui.on('Page.javascriptDialogOpening', event => events.push(event.type));
        for (const [method, params] of [['Page.reload', {}], ['Page.close', {}], ['Page.navigate', { url: 'about:blank' }]]) {
          const count = events.length, operation = command(method, params);
          await waitFor(() => events.length > count, 'aviso nativo durante guardado'); assert.equal(events.at(-1), 'beforeunload');
          await command('Page.handleJavaScriptDialog', { accept: false }); await operation;
        }
        off(); assert.equal(await patches(), 1);
        await ui.menu('/inicio'); await ui.guard();
        assert.match(await evaluate(`${dialog}.textContent`), /Tienes cambios de asistencia pendientes/);

        assert.equal(await evaluate(`${button('Salir sin guardar')}.disabled`), true);
        await ui.cancel(); await evaluate('navigationTest.releasePatch()');
        await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        assert.equal(await prevented(), false); await ui.menu('/inicio'); await wait('location.pathname === "/inicio"');
      });
      await t.test('incertidumbre conserva aviso hasta GET, sin bloquear permanentemente ni repetir PATCH', async () => {
        await ui.prepare(); await evaluate('navigationTest.saveStatus = "network"; navigationTest.readStatus = 500'); await save();
        await wait(`Boolean(${button('Consultar estado actual')})`); assert.equal(await prevented(), true);
        await ui.menu('/inicio'); await ui.guard();
        assert.match(await evaluate(`${dialog}.textContent`), /Tienes cambios de asistencia pendientes/);
        assert.equal(await evaluate(`${button('Salir sin guardar')}.disabled`), false);
        await ui.cancel(); await evaluate('navigationTest.readStatus = null'); await click('Consultar estado actual');
        await wait('document.body.textContent.includes("Lista consultada")');
        assert.equal(await prevented(), true); assert.equal(await patches(), 1);
        await ui.menu('/inicio'); await ui.guard(); await ui.confirm(); await wait('location.pathname === "/inicio"');
      });
      await t.test('expiración y 401 retiran padrón y aviso aunque siga pendiente el PATCH', async () => {
        for (const invalidate of ['authTest.offset = 1000000; window.dispatchEvent(new Event("focus"))',
          'authTest.meStatus = "401"; void authTest.verify()']) {
          await ui.prepare(); await evaluate('navigationTest.holdPatch = true'); await save(); await wait('Boolean(navigationTest.releasePatch)');
          await evaluate(invalidate); await wait('location.pathname === "/login"');
          assert.equal(await prevented(), false); assert.equal(await evaluate(`${rows}.length`), 0);
          await evaluate('navigationTest.releasePatch()'); await wait('navigationTest.server.padron[0].estado === "PRESENTE"');
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez|Cambios guardados correctamente/);
        }
      });
    } finally { await ui.close(); }
  });
