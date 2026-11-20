import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('formularios: errores previstos y comprobación tras una escritura incierta',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 180000 }, async t => {
    const ui = await authBrowser('formErrorsHarness.jsx');
    const { evaluate, wait, click } = ui;
    try {
      await ui.navigate('/inicio');
      await wait('typeof formErrorsTest.open === "function"');
      for (const kind of ['withdraw', 'section', 'reentry', 'password']) {
        for (const mode of ['business400', 'business403', 'business409', 'network', 'server500', 'badSuccess']) {
          await t.test(`${kind}: ${mode}`, async () => {
            await evaluate(`formErrorsTest.open(${JSON.stringify(kind)}, ${JSON.stringify(mode)})`);
            await wait('Boolean(document.querySelector("dialog[open] form"))');
            if (kind === 'password') {
              await evaluate(`(() => {
                for (const [i, input] of [...document.querySelectorAll('input')].entries()) {
                  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input,
                    i === 0 ? 'AnteriorFicticia' : 'NuevaFicticia');
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                }
              })()`);
            }
            await wait('!document.querySelector("button[type=submit]").disabled');
            await evaluate('document.querySelector("button[type=submit]").click()');
            await wait('Boolean(document.querySelector("[role=alert]"))');
            const text = await evaluate('document.querySelector("[role=alert]").textContent');
            assert.doesNotMatch(text, /Detalle técnico ficticio|<html>/);
            assert.equal(await evaluate('formErrorsTest.writes'), 1);
            assert.equal(await evaluate('formErrorsTest.successes'), 0);
            const incierto = ['network', 'server500', 'badSuccess'].includes(mode);
            if (incierto) {
              assert.match(text, /No se pudo confirmar.*Comprueba el estado/);
              assert.doesNotMatch(text, /intenta nuevamente|reintenta/i);
              assert.equal(await evaluate('document.querySelector("button[type=submit]").disabled'), true);
              assert.equal(await evaluate('[...document.querySelectorAll("input, select")].every(e => e.disabled)'), true);
              await evaluate('document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))');
              assert.equal(await evaluate('formErrorsTest.writes'), 1);
              if (kind === 'password') {
                assert.match(await evaluate('document.body.textContent'), /ventana privada con la nueva contraseña/);
                await click('Cerrar');
              } else {
                await click('Comprobar estado');
                assert.equal(await evaluate('formErrorsTest.checks'), 1);
              }
            } else {
              assert.equal(await evaluate('document.querySelector("button[type=submit]").disabled'), false);
              if (mode === 'business400') assert.match(text, kind === 'password' ? /Contraseña actual incorrecta/ : /fecha indicada no es válida/);
              if (mode === 'business403') assert.match(text, /No tienes permiso/);
              if (mode === 'business409') assert.match(text, /estado actual/);
              await click('Cancelar');
            }
            await wait('!document.querySelector("dialog[open]")');
            assert.equal(await evaluate('formErrorsTest.closed'), 1);
            assert.equal(await evaluate('formErrorsTest.writes'), 1);
            assert.equal(await evaluate('formErrorsTest.successes'), 0);
          });
        }
      }
      for (const kind of ['section', 'reentry']) {
        await t.test(`${kind}: error al consultar secciones no se presenta como listado vacío`, async () => {
          await evaluate(`formErrorsTest.open(${JSON.stringify(kind)}, 'load403')`);
          await wait('Boolean(document.querySelector("dialog[open] [role=alert]"))');
          assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /No tienes permiso/);
          assert.equal(await evaluate('formErrorsTest.writes'), 0);
          await click('Cerrar');
          await wait('!document.querySelector("dialog[open]")');
        });
      }
    } finally { await ui.close(); }
  });
