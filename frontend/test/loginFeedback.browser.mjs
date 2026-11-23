import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('login: mensajes sencillos y espera real, sin contador inventado ni errores al escribir',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 60000 }, async t => {
    t.diagnostic('Iniciando navegador aislado con APIs simuladas');
    const ui = await authBrowser();
    const text = () => ui.evaluate('document.body.textContent');
    async function fill(name, value) {
      await ui.evaluate(`(() => { const input = document.querySelector('input[name=${name}]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    }
    try {
      await ui.navigate('/login');
      t.diagnostic('Formulario cargado');
      assert.doesNotMatch(await text(), /bytes|UTF-8|obligatoria|Intentos restantes/);
      await fill('usuario', 'ficticio'); await ui.click('Iniciar sesión');
      await ui.wait('document.body.textContent.includes("La contraseña es obligatoria")');
      t.diagnostic('Campo vacío verificado');
      assert.equal(await ui.evaluate('authTest.calls.length'), 0);
      await fill('password', 'a');
      assert.doesNotMatch(await text(), /bytes|UTF-8|obligatoria|mínimo|Intentos restantes/);
      await ui.evaluate('authTest.loginStatus = 401; authTest.loginRemaining = 4');
      await ui.click('Iniciar sesión'); await ui.wait('document.body.textContent.includes("Usuario o contraseña incorrectos")');
      assert.match(await text(), /Usuario o contraseña incorrectos\. Te quedan 4 intentos/);
      t.diagnostic('Credenciales y contador verificados');
      assert.equal(await ui.evaluate('authTest.calls.filter(c => c.url === "/auth/login").length'), 1);
      await fill('usuario', 'otro-ficticio'); assert.doesNotMatch(await text(), /Te quedan/);
      await fill('password', 'a');
      await ui.evaluate('authTest.loginStatus = 429; authTest.loginRemaining = null; authTest.loginWait = 60');
      await ui.click('Iniciar sesión'); await ui.wait('document.body.textContent.includes("Por seguridad, podrás intentarlo nuevamente en")');
      assert.match(await text(), /01:00|00:59/); assert.doesNotMatch(await text(), /Te quedan|bytes|UTF-8/);
      assert.equal(await ui.evaluate('document.querySelector("button[type=submit]").disabled'), true);
      await fill('usuario', 'otra-cuenta');
      assert.equal(await ui.evaluate('document.querySelector("button[type=submit]").disabled'), true);
      t.diagnostic('Espera de 60 segundos y botón deshabilitado verificados');
      const calls = await ui.evaluate('authTest.calls.length');
      await ui.evaluate('authTest.offset = 61000');
      await ui.wait('document.body.textContent.includes("La espera indicada terminó")');
      assert.equal(await ui.evaluate('document.querySelector("button[type=submit]").disabled'), false);
      assert.equal(await ui.evaluate('authTest.calls.length'), calls);
      await ui.evaluate('authTest.loginStatus = null; authTest.loginWait = null');
      await fill('password', 'a'); await ui.click('Iniciar sesión');
      await ui.wait('location.pathname === "/inicio"');
    } finally { await ui.close(); }
  });
