import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('login: adaptación móvil, ojo accesible sin envío y envío mediante Enter',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 60000 }, async t => {
    const ui = await authBrowser();
    const { evaluate, command, wait } = ui;
    const password = 'document.querySelector("input[name=password]")';
    const eye = 'document.querySelector("button[aria-controls=login-password]")';
    const loginCalls = 'authTest.calls.filter(call => call.url === "/auth/login").length';
    async function key(key, code, value) {
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: value,
        text: key === 'Enter' ? '\r' : key });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: value });
    }
    try {
      await ui.navigate('/login');
      await wait('document.querySelector("img").complete && document.querySelector("img").naturalWidth > 0');
      await t.test('412 y 320 px: insignia proporcional y campos sin desbordamientos ni superposiciones', async () => {
        for (const width of [412, 320, 1280]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: width === 320 ? 568 : 915,
            deviceScaleFactor: 1, mobile: width < 600 });
          const layout = await evaluate(`(() => {
            const image = document.querySelector('img'), badge = image.getBoundingClientRect();
            const card = document.querySelector('section').getBoundingClientRect();
            const fields = [...document.querySelectorAll('form input')].map(input => {
              const bounds = input.getBoundingClientRect(), css = getComputedStyle(input);
              const label = input.labels[0], range = document.createRange();
              range.selectNodeContents(label.firstChild);
              const text = range.getBoundingClientRect();
              const icon = input.parentElement.parentElement.querySelector(':scope > svg').getBoundingClientRect();
              return icon.left >= bounds.left && icon.right + 4 <= text.left
                && Math.abs(icon.top + icon.height / 2 - text.top - text.height / 2) < 2
                && icon.bottom < bounds.top && parseFloat(css.paddingLeft) === 12
                && input.required && getComputedStyle(label.querySelector('span')).display === 'none';
            });
            const input = ${password}, bounds = input.getBoundingClientRect();
            const eyeBounds = ${eye}.getBoundingClientRect();
            return { overflow: document.documentElement.scrollWidth > innerWidth,
              badgeWidth: badge.width, ratio: badge.width / badge.height,
              naturalRatio: image.naturalWidth / image.naturalHeight,
              centered: Math.abs(card.left + card.width / 2 - innerWidth / 2) < 1,
              fieldsClear: fields.every(Boolean), eyeClear: eyeBounds.left > bounds.right - parseFloat(getComputedStyle(input).paddingRight)
                && eyeBounds.right <= bounds.right && eyeBounds.top >= bounds.top && eyeBounds.bottom <= bounds.bottom };
          })()`);
          assert.equal(layout.overflow, false, `ancho ${width}`);
          assert.equal(layout.badgeWidth, 171);
          assert.ok(Math.abs(layout.ratio - layout.naturalRatio) < 0.01);
          assert.equal(layout.centered, true);
          assert.equal(layout.fieldsClear, true);
          assert.equal(layout.eyeClear, true);
          if (width === 412) {
            const screenshot = await command('Page.captureScreenshot', { format: 'png' });
            await writeFile('node_modules/.tmp/login-412.png', Buffer.from(screenshot.data, 'base64'));
          }
        }
      });
      await t.test('validaciones permanecen y no emiten solicitudes', async () => {
        await ui.click('Iniciar sesión');
        await wait('document.querySelectorAll("input[aria-invalid=true]").length === 2');
        assert.equal(await evaluate(loginCalls), 0);
        assert.equal(await evaluate('document.activeElement.name'), 'usuario');
      });
      await evaluate(`(() => { for (const name of ['usuario', 'password']) {
        const input = document.querySelector('input[name="' + name + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'simulado');
        input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      await t.test('ojo oculto inicialmente; clic y teclado alternan sin enviar ni perder el valor', async () => {
        assert.equal(await evaluate(`${password}.type`), 'password');
        assert.equal(await evaluate(`${eye}.type`), 'button');
        await evaluate(`${eye}.click()`);
        await wait(`${password}.type === 'text' && ${eye}.getAttribute('aria-label') === 'Ocultar contraseña'`);
        assert.equal(await evaluate(`${eye}.getAttribute('aria-pressed')`), 'true');
        assert.equal(await evaluate(`${password}.value`), 'simulado');
        assert.equal(await evaluate(loginCalls), 0);
        await evaluate(`${eye}.focus()`);
        await key('Enter', 'Enter', 13);
        await wait(`${password}.type === 'password' && ${eye}.getAttribute('aria-label') === 'Mostrar contraseña'`);
        await key(' ', 'Space', 32);
        await wait(`${password}.type === 'text'`);
        assert.equal(await evaluate(loginCalls), 0);
        assert.equal(await evaluate(`${password}.value`), 'simulado');
      });
      await t.test('Enter desde el campo Contraseña envía exactamente un login', async () => {
        await evaluate(`${password}.focus()`);
        await key('Enter', 'Enter', 13);
        await wait('location.pathname === "/inicio" && Boolean(document.querySelector("#main-content"))');
        assert.equal(await evaluate(loginCalls), 1);
      });
    } finally { await ui.close(); }
  });
