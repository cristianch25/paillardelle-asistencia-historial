import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('restauración: conexión temporal, almacenamiento bloqueado y respuestas tardías',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await authBrowser();
    const { evaluate, command, wait, click } = ui;
    const stored = 'sessionStorage.getItem("paillardelle.auth")';
    try {
      await t.test('red, timeout y 500 mantienen ruta y candidato; reintento valida antes de autenticar', async () => {
        for (const status of ['network', 'timeout', '500']) {
          await ui.navigate('/login');
          if (await evaluate('Boolean(document.querySelector("#main-content"))')) { await click('Cerrar sesión'); await wait('location.pathname === "/login"'); }
          await ui.login(); const expiry = await evaluate(`JSON.parse(${stored}).expiresAt`);
          await ui.navigate(`/secciones?me=${status}`);
          assert.equal(await evaluate('location.pathname'), '/secciones');
          assert.equal(await evaluate('Boolean(document.querySelector("#main-content, input[name=usuario]"))'), false);
          assert.equal(await evaluate(`JSON.parse(${stored}).expiresAt`), expiry);
          await evaluate('authTest.meStatus = null; authTest.userName = "Perfil actualizado"');
          await click('Reintentar comprobación'); await wait('Boolean(document.querySelector("#main-content"))');
          assert.match(await evaluate('document.body.textContent'), /Perfil actualizado/);
          assert.equal(await evaluate(`JSON.parse(${stored}).expiresAt`), expiry);
        }
      });
      await t.test('restauración lenta no redirige ni revela contenido; logout impide la respuesta tardía', async () => {
        await ui.setRoute('/inicio?hold=1'); await command('Page.reload', { ignoreCache: true });
        await wait('Boolean(window.authTest) && authTest.pending.length > 0');
        assert.equal(await evaluate('location.pathname'), '/inicio');
        assert.match(await evaluate('document.body.textContent'), /Comprobando sesión/);
        assert.equal(await evaluate('Boolean(document.querySelector("#main-content"))'), false);
        await click('Cancelar e iniciar sesión'); await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${stored} === null`), true);
        await evaluate('authTest.holdMe = false; authTest.releaseMe()');
        await evaluate('new Promise(resolve => setTimeout(resolve, 30))');
        assert.equal(await evaluate('Boolean(document.querySelector("#main-content"))'), false);
        assert.equal(await evaluate(`${stored} === null`), true);
      });
      await t.test('storage inaccesible permite login en memoria con aviso; F5 requiere login', async () => {
        await ui.navigate('/login?storage=blocked'); await ui.login();
        assert.match(await evaluate('document.body.textContent'), /activa solo en esta página/);
        await ui.setRoute('/inicio?storage=blocked'); await ui.reload(); await wait('location.pathname === "/login"');
        assert.equal(await evaluate('Boolean(document.querySelector("#main-content"))'), false);
        await evaluate('authTest.restoreStorage()');
      });
      await t.test('cuota de escritura agotada no interrumpe login ni deja un registro de autenticación', async () => {
        await ui.navigate('/login?storage=write'); await ui.login();
        assert.equal(await evaluate(`${stored} === null`), true);
        assert.match(await evaluate('document.body.textContent'), /no permite conservarla al recargar/);
        await evaluate('authTest.restoreStorage()'); await click('Cerrar sesión'); await wait('location.pathname === "/login"');
      });
      await t.test('si el navegador impide borrar e invalidar, logout retira acceso y advierte cerrar pestaña', async () => {
        await ui.login(); await ui.navigate('/inicio?storage=clear');
        await click('Cerrar sesión'); await wait('location.pathname === "/login"');
        assert.equal(await evaluate('Boolean(document.querySelector("#main-content"))'), false);
        assert.match(await evaluate('document.body.textContent'), /impidió limpiar el acceso guardado/);
        await evaluate('authTest.restoreStorage(); sessionStorage.removeItem("paillardelle.auth")');
      });
    } finally { await ui.close(); }
  });
