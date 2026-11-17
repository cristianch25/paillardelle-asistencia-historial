import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigationBrowser } from './support/navigationBrowser.mjs';
import { hasEdge, edgePath, waitFor } from './support/edgeBrowser.mjs';

test('6B.2C: guardado en curso, pérdida de acceso y beforeunload nativo',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await navigationBrowser();
    const { evaluate, wait, click, command, dialog, rows } = ui;
    try {
      await t.test('durante PATCH no se puede confirmar salida; cancelar conserva la operación única', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente');
        await evaluate('navigationTest.holdPatch = true'); await click('Guardar cambios'); await wait('Boolean(navigationTest.releasePatch)');
        await ui.menu('/inicio'); await ui.guard();
        assert.equal(await evaluate(`${ui.button('Salir sin guardar')}.disabled`), true);
        await ui.cancel(); await evaluate('navigationTest.releasePatch()');
        await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        assert.equal(await ui.dirty(), 0);
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 1);
        assert.equal(await evaluate('(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()'), false);
        await ui.menu('/inicio'); await wait('location.pathname === "/inicio"'); assert.equal(await evaluate(`Boolean(${dialog})`), false);
      });
      await t.test('una navegación pendiente solo continúa después de confirmar el guardado', async () => {
        await ui.prepare(); await ui.choose(0, 'Falta'); await evaluate('navigationTest.holdPatch = true'); await click('Guardar cambios');
        await wait('Boolean(navigationTest.releasePatch)'); await ui.menu('/inicio'); await ui.guard();
        await evaluate('navigationTest.releasePatch()'); await wait('location.pathname === "/inicio"');
        assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'FALTA');
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 1);
      });
      await t.test('resultado incierto impide salir hasta consultar; no reenvía ni anuncia éxito', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente');
        await evaluate('navigationTest.saveStatus = 500; navigationTest.holdRead = true'); await click('Guardar cambios');
        await wait('Boolean(navigationTest.releaseRead)'); await ui.menu('/inicio'); await ui.guard();
        assert.equal(await evaluate(`${ui.button('Salir sin guardar')}.disabled`), true);
        await evaluate('navigationTest.releaseRead()'); await wait('document.body.textContent.includes("Lista consultada")');
        assert.equal(await evaluate('location.pathname'), '/secciones/asistencia');
        assert.equal(await evaluate(`${ui.button('Salir sin guardar')}.disabled`), false);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Cambios guardados correctamente/);
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 1);
        await ui.cancel(); assert.equal(await ui.dirty(), 1);
      });
      await t.test('401 y expiración no esperan al diálogo ni conservan datos protegidos', async () => {
        for (const invalidate of ['authTest.meStatus = "401"; void authTest.verify()', 'authTest.offset = 1000000; window.dispatchEvent(new Event("focus"))']) {
          await ui.prepare(); await ui.choose(0, 'Presente'); await ui.menu('/inicio'); await ui.guard();
          await evaluate(invalidate); await wait('location.pathname === "/login"');
          assert.equal(await evaluate(`Boolean(${dialog})`), false);
          assert.equal(await evaluate('sessionStorage.getItem("paillardelle.auth") === null'), true);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez/);
        }
      });
      await t.test('pérdida confirmada de permisos retira inmediatamente el padrón y la confirmación', async () => {
        await ui.prepare(); await ui.choose(0, 'Tardanza'); await ui.menu('/inicio'); await ui.guard();
        await evaluate('navigationTest.allow = false; window.dispatchEvent(new Event("focus"))');
        await wait(`${rows}.length === 0 && !${dialog}`);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez/);
      });
      await t.test('fallo temporal de revalidación oculta datos y conserva borrador hasta reintentar', async () => {
        await ui.prepare(); await ui.choose(0, 'Presente');
        await evaluate('navigationTest.sectionStatus = "network"; window.dispatchEvent(new Event("focus"))');
        await wait(`${rows}.length === 0 && Boolean(${ui.button('Volver a comprobar selección')})`);
        await ui.menu('/inicio'); await ui.guard(); await ui.cancel();
        await evaluate('navigationTest.sectionStatus = null'); await click('Volver a comprobar selección');
        await wait(`${rows}.length === 4`); assert.equal(await ui.dirty(), 1);
      });
      await t.test('F5, cierre y salida del documento usan aviso nativo; confirmar F5 descarta borrador y restaura autenticación', async () => {
        await ui.prepare();
        const events = [];
        const off = ui.on('Page.javascriptDialogOpening', event => events.push(event.type));
        await command('Page.enable'); await ui.touchMark();
        for (const [method, params] of [['Page.reload', {}], ['Page.close', {}], ['Page.navigate', { url: 'about:blank' }]]) {
          const count = events.length, operation = command(method, params);
          await waitFor(() => events.length > count, 'aviso nativo'); assert.equal(events.at(-1), 'beforeunload');
          await command('Page.handleJavaScriptDialog', { accept: false }); await operation;
          assert.equal(await ui.dirty(), 1);
        }
        const count = events.length, reload = command('Page.reload');
        await waitFor(() => events.length > count, 'confirmar F5');
        await command('Page.handleJavaScriptDialog', { accept: true }); await reload;
        await wait('Boolean(document.querySelector("#main-content")) && document.body.textContent.includes("Selecciona una sección")');
        assert.equal(await evaluate('location.pathname'), '/secciones/asistencia');
        assert.equal(await evaluate(`${rows}.length`), 0);
        assert.deepEqual(await evaluate('Object.keys(JSON.parse(sessionStorage.getItem("paillardelle.auth"))).sort()'), ['expiresAt', 'token']);
        assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), 0);
        assert.equal(await evaluate('(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()'), false);
        off();
      });
    } finally { await ui.close(); }
  });
