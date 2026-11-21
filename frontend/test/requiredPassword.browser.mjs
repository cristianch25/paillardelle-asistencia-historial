import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

const options = { skip: !hasEdge, timeout: 90000 };
const forced = 'Boolean(document.querySelector("dialog[open]")) && document.body.textContent.includes("Cambio obligatorio de contraseña")';
const posts = 'passwordTest.calls.filter(c=>c.url==="/auth/cambiar-contrasena").length';
async function start(query = '') {
  const ui = await authBrowser('requiredPasswordHarness.jsx');
  try { await ui.navigate(`/login${query}`); await ui.login(); return ui; }
  catch (error) { await ui.close(); throw error; }
}
async function fill(ui, current = 'InicialFicticia123', next = 'NuevaFicticia123') {
  await ui.evaluate(`(() => { const inputs = document.querySelectorAll('dialog[open] input');
    ${JSON.stringify([current, next, next])}.forEach((value,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],value);
      inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}); })()`);
  await ui.evaluate('document.querySelector("dialog[open] button[type=submit]").click()');
}

test('primer ingreso y F5 muestran solo cambio obligatorio; errores no desbloquean y el éxito consulta /me', options, async () => {
  const ui = await start();
  try {
    await ui.wait(forced); assert.equal(await ui.evaluate('Boolean(document.querySelector("aside"))'), false);
    assert.ok(await ui.evaluate('passwordTest.calls.every(c=>c.url.startsWith("/auth/"))'));
    await ui.reload(); await ui.wait(forced); assert.equal(await ui.evaluate(posts), 0);
    await fill(ui, 'Incorrecta'); await ui.wait('document.body.textContent.includes("Contraseña actual incorrecta.")');
    await fill(ui, 'InicialFicticia123', 'InicialFicticia123'); await ui.wait('document.body.textContent.includes("debe ser distinta")');
    assert.equal(await ui.evaluate('Boolean(document.querySelector("aside"))'), false);
    await fill(ui); await ui.wait('Boolean(document.querySelector("aside")) && !document.querySelector("dialog[open]")');
    assert.equal(await ui.evaluate(posts), 3);
    assert.equal(await ui.evaluate('passwordTest.required'), false);
    assert.ok(await ui.evaluate('passwordTest.calls.filter(c=>c.url==="/auth/me").length>=2'));
    assert.equal(await ui.evaluate('JSON.stringify({...sessionStorage,...localStorage,...passwordTest}).includes("NuevaFicticia123")'), false);
  } finally { await ui.close(); }
});

test('cambio confirmado con fallo de /me conserva pantalla restringida y solo reintenta la consulta del perfil', options, async () => {
  const ui = await start();
  try {
    await ui.wait(forced); await ui.evaluate('passwordTest.meStatus=503'); await fill(ui);
    await ui.wait('document.body.textContent.includes("No se pudo comprobar el perfil")');
    assert.equal(await ui.evaluate(posts), 1); assert.equal(await ui.evaluate('Boolean(document.querySelector("aside"))'), false);
    await ui.evaluate('passwordTest.meStatus=null'); await ui.click('Actualizar perfil');
    await ui.wait('Boolean(document.querySelector("aside"))'); assert.equal(await ui.evaluate(posts), 1);
  } finally { await ui.close(); }
});

test('COMMIT incierto no reenvía; consultar /me puede confirmar el indicador actualizado', options, async () => {
  const ui = await start();
  try {
    await ui.wait(forced); await ui.evaluate('passwordTest.writeStatus=500;passwordTest.persistOnError=true'); await fill(ui);
    await ui.wait('document.body.textContent.includes("No se pudo confirmar el resultado")');
    assert.equal(await ui.evaluate(posts), 1);
    await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
    await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' });
    assert.ok(await ui.evaluate('Boolean(document.querySelector("dialog[open]"))'));
    await ui.click('Consultar perfil'); await ui.wait('Boolean(document.querySelector("aside"))');
    assert.equal(await ui.evaluate(posts), 1);
  } finally { await ui.close(); }
});

test('un restablecimiento durante una sesión vigente fuerza la pantalla mediante 403 específico y permite cerrar sesión', options, async () => {
  const ui = await start('?required=0');
  try {
    await ui.wait('Boolean(document.querySelector("aside"))');
    const before = await ui.evaluate('sessionStorage.getItem("paillardelle.auth")');
    await ui.evaluate('passwordTest.required=true;void passwordTest.trigger()'); await ui.wait(forced);
    assert.equal(await ui.evaluate('Boolean(document.querySelector("aside"))'), false);
    assert.equal(await ui.evaluate('sessionStorage.getItem("paillardelle.auth")'), before);
    await ui.click('Cerrar sesión'); await ui.wait('location.pathname==="/login"');
    assert.equal(await ui.evaluate('sessionStorage.getItem("paillardelle.auth")'), null);
  } finally { await ui.close(); }
});
