import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { edgePath, hasEdge } from './support/edgeBrowser.mjs';

test('autenticación real del frontend: restauración por F5, vencimiento y logout',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await authBrowser();
    const { evaluate, wait, click } = ui;
    const stored = 'sessionStorage.getItem("paillardelle.auth")';
    try {
      await ui.navigate('/login'); await ui.login();
      await t.test('solo persiste JWT y vencimiento; perfil reconstruido con /me', async () => {
        assert.deepEqual(await evaluate(`Object.keys(JSON.parse(${stored})).sort()`), ['absoluteExpiresAt', 'expiresAt', 'lastActivityAt', 'lastRenewedActivityAt', 'token']);
        assert.match(await evaluate('document.body.textContent'), /Perfil validado/);
        assert.ok(await evaluate('authTest.calls.some(call => call.url === "/auth/me" && call.bearer)'));
      });
      await t.test('F5 en Inicio, Secciones y Asistencia conserva ruta y vencimiento sin POST de login ni PATCH', async () => {
        const expiry = await evaluate(`JSON.parse(${stored}).expiresAt`);
        for (const route of ['/inicio', '/secciones?page=2', '/secciones/asistencia']) {
          await ui.setRoute(route); await wait(`location.pathname + location.search === ${JSON.stringify(route)}`);
          await ui.reload(); await wait('Boolean(document.querySelector("#main-content"))');
          assert.equal(await evaluate('location.pathname + location.search'), route);
          assert.equal(await evaluate(`JSON.parse(${stored}).expiresAt`), expiry);
          assert.ok(await evaluate('authTest.calls.some(call => call.url === "/auth/me")'));
          assert.equal(await evaluate('authTest.calls.filter(call => call.method === "post" || call.method === "patch").length'), 0);
        }
        assert.match(await evaluate('document.body.textContent'), /Selecciona una sección/);
      });
      await t.test('logout limpia almacenamiento; F5 no recupera acceso', async () => {
        await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${stored} === null`), true);
        await ui.reload();
        assert.ok(await evaluate('Boolean(document.querySelector("input[name=usuario]"))'));
        assert.equal(await evaluate('authTest.calls.length'), 0);
      });
      await t.test('vencimiento activo al recuperar foco elimina sesión y almacenamiento', async () => {
        await ui.login();
        await evaluate('authTest.offset = 1000000; window.dispatchEvent(new Event("focus"))');
        await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${stored} === null`), true);
        assert.match(await evaluate('document.body.textContent'), /sesión ha vencido/);
        await evaluate('authTest.offset = 0');
      });
      await t.test('credencial guardada ya vencida se descarta antes de consultar /me', async () => {
        await ui.login();
        await evaluate(`(() => { const entry = JSON.parse(${stored}); entry.expiresAt = Date.now() - 1;
          sessionStorage.setItem('paillardelle.auth', JSON.stringify(entry)); })()`);
        await ui.navigate('/inicio'); await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${stored} === null`), true);
        assert.equal(await evaluate('authTest.calls.length'), 0);
      });
      await t.test('JWT inválido o usuario desactivado: /me devuelve 401 y elimina credencial', async () => {
        for (const scenario of ['invalido', 'desactivado']) {
          await ui.navigate('/login'); await ui.login();
          await ui.navigate(`/secciones?me=401&scenario=${scenario}`); await wait('location.pathname === "/login"');
          assert.equal(await evaluate(`${stored} === null`), true);
          assert.equal(await evaluate('Boolean(document.querySelector("#main-content"))'), false);
        }
      });
      await t.test('un 401 durante el uso normal elimina también el registro guardado', async () => {
        await ui.navigate('/login'); await ui.login();
        await evaluate('authTest.meStatus = "401"; void authTest.verify()');
        await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${stored} === null`), true);
      });
      await t.test('el temporizador expira una sesión sin esperar F5 ni recuperar foco', async () => {
        await ui.navigate('/login'); await evaluate('authTest.expiresIn = 1'); await ui.login();
        await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${stored} === null`), true);
      });
    } finally { await ui.close(); }
  });
