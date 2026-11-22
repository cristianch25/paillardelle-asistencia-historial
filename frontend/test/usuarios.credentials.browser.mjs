import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

const row = `Array.from(document.querySelector('[aria-label="Usuarios encontrados"]').children).find(el=>el.querySelector('h2').textContent.includes('María'))`;
async function action(ui, label) { await ui.evaluate(`Array.from(${row}.querySelectorAll('button')).find(el=>el.textContent===${JSON.stringify(label)}).click()`); }

test('Restablecer: confirmación, visualización una vez y ausencia en catálogo/almacenamiento', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('usuariosHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/usuarios'); await ui.wait('Boolean(document.querySelector("[aria-label=\\"Usuarios encontrados\\"]"))');
    await action(ui, 'Restablecer contraseña'); await ui.wait('Boolean(document.querySelector("dialog[open]"))');
    const reads = await ui.evaluate('usersTest.calls.filter(c=>c.url==="/usuarios" && c.method==="get").length');
    assert.equal(await ui.evaluate('usersTest.calls.filter(c=>c.url.endsWith("restablecer-contrasena")).length'), 0);
    assert.ok(await ui.evaluate('document.querySelector("dialog[open]").textContent.includes("sesiones ya iniciadas")'));
    await ui.click('Confirmar restablecimiento'); await ui.wait('Boolean(document.querySelector("output[aria-label=\\"Contraseña temporal\\"]"))');
    assert.ok(await ui.evaluate('/^[A-Za-z0-9_-]{24}$/.test(document.querySelector("output").textContent)'));
    assert.equal(await ui.evaluate('JSON.stringify(usersTest.users).includes("password_temporal")'), false);
    assert.equal(await ui.evaluate('JSON.stringify({...sessionStorage,...localStorage}).includes("XXXXXXXXXXXXXXXXXXXXXXXX")'), false);
    await ui.click('He guardado la contraseña'); await ui.wait('!document.querySelector("dialog[open]")');
    await ui.wait(`usersTest.calls.filter(c=>c.url==="/usuarios" && c.method==="get").length > ${reads}`);
    await ui.wait('Boolean(document.querySelector("[aria-label=\\"Usuarios encontrados\\"]"))'); await action(ui, 'Restablecer contraseña');
    await ui.wait('Boolean(document.querySelector("dialog[open]"))'); assert.equal(await ui.evaluate('Boolean(document.querySelector("output"))'), false);
    await ui.click('Cancelar'); assert.equal(await ui.evaluate('usersTest.calls.filter(c=>c.url.endsWith("restablecer-contrasena")).length'), 1);
  } finally { await ui.close(); }
});

test('Restablecimiento incierto: no revela contraseña ni reenvía automáticamente', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('usuariosHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/usuarios'); await ui.wait('Boolean(document.querySelector("[aria-label=\\"Usuarios encontrados\\"]"))');
    await ui.evaluate('usersTest.writeStatus=500'); await action(ui, 'Restablecer contraseña'); await ui.click('Confirmar restablecimiento');
    await ui.wait('document.body.textContent.includes("No se pudo confirmar el resultado")');
    assert.equal(await ui.evaluate('Boolean(document.querySelector("output"))'), false);
    assert.equal(await ui.evaluate('Array.from(document.querySelectorAll("button")).some(el=>el.textContent==="Confirmar restablecimiento")'), false);
    assert.equal(await ui.evaluate('usersTest.calls.filter(c=>c.url.endsWith("restablecer-contrasena")).length'), 1);
    await ui.click('Actualizar consulta');
  } finally { await ui.close(); }
});
