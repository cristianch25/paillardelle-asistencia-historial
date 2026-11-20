import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

const options = { skip: !hasEdge, timeout: 90000 };
const list = 'Boolean(document.querySelector("[aria-label=\\"Cuentas ADMIN\\"]"))';
const writes = 'superTest.calls.filter(c=>c.method!=="get")';
async function start() {
  const ui = await authBrowser('superusuarioHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.login('/administradores'); await ui.wait(list);
    return ui;
  } catch (error) { await ui.close(); throw error; }
}
async function rowAction(ui, name, action) {
  await ui.evaluate(`Array.from(document.querySelector('[aria-label="Cuentas ADMIN"]').children)
    .find(row=>row.querySelector('h2').textContent.includes(${JSON.stringify(name)}))
    .querySelectorAll('button')[${action === 'Restablecer contraseña' ? 1 : 0}].click()`);
}
async function fill(ui, selector, values) {
  await ui.evaluate(`(() => { const inputs = document.querySelectorAll(${JSON.stringify(selector)});
    ${JSON.stringify(values)}.forEach((value,index)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[index],value);
    inputs[index].dispatchEvent(new Event('input',{bubbles:true}));}); })()`);
}
async function newAdmin(ui) {
  await ui.click('Crear ADMIN'); await ui.wait('Boolean(document.querySelector("form[aria-label]"))');
  await fill(ui, 'form[aria-label="Crear cuenta ADMIN"] input', ['Rosa', 'Ficticia', 'admin.rosa', 'ClaveSoloMocks123', 'ClaveSoloMocks123']);
  await ui.click('Revisar creación'); await ui.wait('Boolean(document.querySelector("[aria-label=\\"Confirmar creación de ADMIN\\"]"))');
}

test('cuatro roles: navegación conservada; SUPERUSUARIO sin menús ni solicitudes académicas, incluso por URL directa', options, async () => {
  for (const role of ['SUPERUSUARIO', 'ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) {
    const ui = await authBrowser('superusuarioHarness.jsx');
    try {
      await ui.navigate(`/login?role=${role}`); await ui.login(role === 'SUPERUSUARIO' ? '/administradores' : '/inicio');
      const paths = await ui.evaluate('Array.from(document.querySelectorAll("aside nav a")).map(a=>a.getAttribute("href"))');
      if (role !== 'SUPERUSUARIO') {
        assert.ok(paths.includes('/inicio')); assert.ok(paths.includes('/secciones')); assert.ok(!paths.includes('/administradores'));
        await ui.setRoute('/administradores'); await ui.wait('location.pathname === "/inicio"');
        continue;
      }
      assert.deepEqual(paths, ['/administradores']); await ui.wait(list);
      assert.ok(await ui.evaluate('document.querySelector("header").textContent.includes("SUPERUSUARIO")'));
      for (const path of ['/inicio', '/usuarios', '/auditoria', '/anios-escolares', '/secciones', '/reportes', '/calendario', '/estadisticas', '/asistencias/supervision']) {
        await ui.setRoute(path); await ui.wait('location.pathname === "/administradores"'); await ui.wait(list);
      }
      assert.ok(await ui.evaluate('superTest.calls.every(c=>c.url==="/usuarios")'));
      await ui.reload(); await ui.wait(list);
      assert.ok(await ui.evaluate('document.querySelector("header").textContent.includes("SUPERUSUARIO")'));
      for (const width of [320, 1440]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width === 320 });
        assert.ok(await ui.evaluate('document.documentElement.scrollWidth <= innerWidth'));
      }
    } finally { await ui.close(); }
  }
});

test('crear ADMIN: confirmación, envío único durante carga y secretos ausentes de listados y almacenamiento', options, async () => {
  const ui = await start();
  try {
    await newAdmin(ui);
    assert.equal(await ui.evaluate(`${writes}.length`), 0);
    assert.equal(await ui.evaluate('document.body.textContent.includes("ClaveSoloMocks123")'), false);
    assert.equal(await ui.evaluate('Boolean(document.querySelector("form select"))'), false);
    await ui.evaluate('superTest.holdWrite=true'); await ui.click('Confirmar creación');
    await ui.wait('document.body.textContent.includes("Creando…")');
    assert.equal(await ui.evaluate(`${writes}.length`), 1);
    await ui.evaluate('superTest.release()'); await ui.wait(list);
    assert.ok(await ui.evaluate('document.querySelector("[aria-label=\\"Cuentas ADMIN\\"]").textContent.includes("Rosa Ficticia")'));
    assert.deepEqual(await ui.evaluate('superTest.lastCreate'), { nombres: 'Rosa', apellidos: 'Ficticia', usuario: 'admin.rosa', rol: 'ADMIN', passwordProvided: true });
    assert.equal(await ui.evaluate('JSON.stringify({...sessionStorage,...localStorage,...superTest}).includes("ClaveSoloMocks123")'), false);
    assert.equal(await ui.evaluate(`${writes}.length`), 1);
    assert.equal(await ui.evaluate('Boolean(document.querySelector("output"))'), false);
  } finally { await ui.close(); }
});

test('estado ADMIN: cancelación, protección del último activo, activación y desactivación confirmadas', options, async () => {
  const ui = await start();
  try {
    await rowAction(ui, 'Ana', 'Desactivar'); assert.equal(await ui.evaluate(`${writes}.length`), 0);
    await ui.click('Cancelar'); assert.equal(await ui.evaluate(`${writes}.length`), 0);
    await rowAction(ui, 'Ana', 'Desactivar'); await ui.click('Confirmar estado');
    await ui.wait('document.body.textContent.includes("Debe conservarse al menos un ADMIN activo.") && !Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Confirmar estado")?.disabled');
    assert.equal(await ui.evaluate('superTest.users[0].activo'), true);
    await ui.click('Cancelar'); await rowAction(ui, 'Luis', 'Activar'); await ui.click('Confirmar estado');
    await ui.wait('superTest.users[1].activo===true'); await ui.wait(list);
    await rowAction(ui, 'Ana', 'Desactivar'); await ui.click('Confirmar estado');
    await ui.wait('superTest.users[0].activo===false'); await ui.wait(list);
    assert.equal(await ui.evaluate(`${writes}.length`), 3);
    assert.equal(await ui.evaluate('superTest.users.filter(user=>user.activo).length'), 1);
  } finally { await ui.close(); }
});

test('resultado incierto al crear: no reenvía, limpia contraseña y exige consulta manual; errores de lectura y carga visibles', options, async () => {
  const ui = await start();
  try {
    await newAdmin(ui); await ui.evaluate('superTest.writeStatus=500'); await ui.click('Confirmar creación');
    await ui.wait('document.body.textContent.includes("No se pudo confirmar la operación")');
    assert.equal(await ui.evaluate(`${writes}.length`), 1);
    assert.equal(await ui.evaluate('Boolean(document.querySelector("form[aria-label=\\"Crear cuenta ADMIN\\"]"))'), false);
    await ui.evaluate('superTest.readStatus=503'); await ui.click('Actualizar consulta');
    await ui.wait('document.body.textContent.includes("no está disponible")');
    await ui.evaluate('superTest.readStatus=null;superTest.holdRead=true'); await ui.click('Actualizar consulta');
    await ui.wait('document.body.textContent.includes("Cargando cuentas ADMIN")');
    assert.ok(await ui.evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Crear ADMIN").disabled'));
    await ui.evaluate('superTest.holdRead=false;superTest.release()'); await ui.wait(list);
    assert.ok(await ui.evaluate('document.querySelector("[aria-label=\\"Cuentas ADMIN\\"]").textContent.includes("Rosa")'));
    assert.equal(await ui.evaluate(`${writes}.length`), 1);
    await rowAction(ui, 'Ana', 'Desactivar'); await ui.click('Confirmar estado');
    await ui.wait('document.body.textContent.includes("No se pudo confirmar la operación") && !document.querySelector("[aria-label=\\"Cuentas ADMIN\\"]")');
    assert.equal(await ui.evaluate(`${writes}.length`), 2);
    await ui.click('Actualizar consulta'); await ui.wait(list);
    assert.equal(await ui.evaluate('superTest.users[0].activo'), false);
    assert.equal(await ui.evaluate(`${writes}.length`), 2);
  } finally { await ui.close(); }
});

test('paginación, lista vacía, permisos de lectura y cancelación de formulario sin escrituras', options, async () => {
  const ui = await start();
  try {
    await ui.evaluate('superTest.users.push(...Array.from({length:21},(_,i)=>({id:String(i+3),nombres:"Cuenta "+i,apellidos:"Ficticia",usuario:"cuenta"+i,rol:"ADMIN",activo:false})))');
    await ui.click('Actualizar consulta'); await ui.wait('document.querySelector("[aria-label=\\"Cuentas ADMIN\\"]").children.length===20');
    await ui.click('Siguiente'); await ui.wait('document.querySelector("[aria-label=\\"Cuentas ADMIN\\"]")?.children.length===3');
    await ui.click('Anterior'); await ui.wait('document.querySelector("[aria-label=\\"Cuentas ADMIN\\"]")?.children.length===20');
    await ui.click('Crear ADMIN'); await fill(ui, 'form[aria-label="Crear cuenta ADMIN"] input', ['Borrador']);
    await ui.click('Cancelar'); await ui.wait('Boolean(document.querySelector("dialog[open]"))');
    assert.ok(await ui.evaluate('document.querySelector("dialog[open]").textContent.includes("cambios de cuentas pendientes")'));
    await ui.click('Salir sin guardar'); await ui.wait(list); assert.equal(await ui.evaluate(`${writes}.length`), 0);
    await ui.evaluate('superTest.readStatus=403'); await ui.click('Actualizar consulta');
    await ui.wait('document.body.textContent.includes("No tienes permiso")');
    await ui.evaluate('superTest.readStatus=null;superTest.users=[]'); await ui.click('Actualizar consulta');
    await ui.wait('document.body.textContent.includes("No hay cuentas ADMIN en esta página")');
  } finally { await ui.close(); }
});

test('restablecimiento: confirmación, secreto de una sola entrega, incertidumbre sin reenvío y contraseña propia', options, async () => {
  const ui = await start();
  try {
    await rowAction(ui, 'Ana', 'Restablecer contraseña'); await ui.wait('Boolean(document.querySelector("dialog[open]"))');
    assert.equal(await ui.evaluate(`${writes}.length`), 0);
    await ui.click('Confirmar restablecimiento'); await ui.wait('Boolean(document.querySelector("output[aria-label=\\"Contraseña temporal\\"]"))');
    assert.equal(await ui.evaluate('JSON.stringify({...sessionStorage,...localStorage,...superTest}).includes("S".repeat(24))'), false);
    await ui.click('He guardado la contraseña'); await ui.wait('!document.querySelector("dialog[open]")'); await ui.wait(list);
    await ui.evaluate('superTest.writeStatus=500'); await rowAction(ui, 'Ana', 'Restablecer contraseña'); await ui.click('Confirmar restablecimiento');
    await ui.wait('document.body.textContent.includes("No se pudo confirmar el resultado")');
    assert.equal(await ui.evaluate('Boolean(document.querySelector("output"))'), false);
    assert.equal(await ui.evaluate('Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="Confirmar restablecimiento")'), false);
    assert.equal(await ui.evaluate(`${writes}.length`), 2);
    await ui.click('Actualizar consulta'); await ui.wait('!document.querySelector("dialog[open]")'); await ui.wait(list);
    await ui.click('Cambiar contraseña'); await ui.wait('Boolean(document.querySelector("dialog[open] input"))');
    await fill(ui, 'dialog[open] input', ['AnteriorFicticia', 'NuevaFicticia123', 'NuevaFicticia123']);
    await ui.evaluate('document.querySelector("dialog[open] button[type=submit]").click()');
    await ui.wait('document.body.textContent.includes("Contraseña cambiada correctamente.")');
    assert.equal(await ui.evaluate('superTest.passwordChanges'), 1);
    await ui.click('Cerrar'); await ui.wait('!document.querySelector("dialog[open]")');
    assert.equal(await ui.evaluate('location.pathname'), '/administradores');
  } finally { await ui.close(); }
});
