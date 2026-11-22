import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

const field = label => `Array.from(document.querySelectorAll('input,select')).find(e=>Array.from(e.labels??[]).some(l=>l.textContent.trim().startsWith(${JSON.stringify(label)})))`;
async function fill(ui, label, value) {
  await ui.evaluate(`(()=>{const e=${field(label)};Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
}
const ready = ui => ui.wait(`Boolean(${field('Docente o auxiliar')})`);
const writes = `usersTest.calls.filter(c=>c.method==='post'&&c.url==='/asignaciones')`;

test('Asignaciones docentes: lote único, conflicto sin parcial, historial, finalización y móvil', { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('teacherAssignmentsHarness.jsx');
  try {
    await ui.navigate('/login'); await ui.login(); await ui.setRoute('/asignaciones-docentes'); await ready(ui);
    await t.test('catálogo mínimo, cuentas elegibles y selección del año abierta', async () => {
      assert.ok(await ui.evaluate(`Boolean(document.querySelector('a[href="/asignaciones-docentes"]'))`));
      assert.equal(await ui.evaluate(`${field('Docente o auxiliar')}.options.length`), 2);
      assert.equal(await ui.evaluate(`usersTest.calls.some(c=>c.url==='/usuarios'||c.url==='/secciones/')`), false);
      await fill(ui, 'Docente o auxiliar', '9007199254741001');
      await ui.wait('document.querySelectorAll("input[type=checkbox]").length===2');
      assert.equal(await ui.evaluate(`${field('Año escolar')}.value`), '9007199254741010');
      assert.equal(await ui.evaluate('document.body.textContent.includes("Secundaria:")'), false);
    });
    await t.test('conflicto previo no envía; servidor 409 conserva todas las selecciones', async () => {
      await ui.evaluate('document.querySelectorAll("input[type=checkbox]").forEach(e=>e.click())');
      await fill(ui, 'Fecha de inicio', '2026-11-22'); await ui.click('Asignar secciones');
      await ui.wait('document.body.textContent.includes("Ya existen asignaciones")');
      assert.equal(await ui.evaluate(writes + '.length'), 0);
      await ui.evaluate('usersTest.assignments[0].fecha_fin="2026-11-20"');
      // La actualización explícita evita operar con un catálogo anterior.
      await ui.click('Volver al listado'); await ui.click('Salir sin guardar');
      await ui.setRoute('/inicio'); await ui.wait('location.pathname==="/inicio"');
      await ui.setRoute('/asignaciones-docentes'); await ready(ui); await fill(ui, 'Docente o auxiliar', '9007199254741001');
      await ui.wait('document.querySelectorAll("input[type=checkbox]").length===2');
      await ui.evaluate('document.querySelectorAll("input[type=checkbox]").forEach(e=>e.click());usersTest.writeStatus=409');
      await fill(ui, 'Fecha de inicio', '2026-11-22'); await ui.click('Asignar secciones');
      await ui.wait('document.body.textContent.includes("Conflicto de asignación")');
      assert.equal(await ui.evaluate('usersTest.assignments.length'), 1);
      assert.equal(await ui.evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 2);
      assert.equal(await ui.evaluate(writes + '.length'), 1);
    });
    await t.test('dos secciones en una petición y conservación del período anterior', async () => {
      await ui.evaluate('usersTest.writeStatus=null'); await ui.click('Asignar secciones');
      await ui.wait('usersTest.assignments.length===3'); await ready(ui);
      assert.equal(await ui.evaluate(writes + '.length'), 2);
      assert.equal(await ui.evaluate(writes + '.at(-1).body.seccion_ids.length'), 2);
      assert.equal(await ui.evaluate('usersTest.assignments[0].fecha_fin'), '2026-11-20');
      await ui.wait('document.querySelectorAll("input[type=checkbox]").length===2');
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await ui.evaluate('document.documentElement.scrollWidth<=innerWidth'));
        const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/assignments-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
    });
    await t.test('finalización confirmada, cancelación e histórico intacto', async () => {
      await ui.click('Finalizar asignación'); await ui.wait('Boolean(document.querySelector("dialog[open]"))');
      await ui.click('Cancelar');
      assert.equal(await ui.evaluate('usersTest.calls.filter(c=>c.method==="patch").length'), 0);
      await ui.click('Finalizar asignación'); await ui.click('Revisar finalización');
      assert.equal(await ui.evaluate('usersTest.calls.filter(c=>c.method==="patch").length'), 0);
      await ui.click('Confirmar finalización'); await ready(ui);
      await ui.wait('usersTest.calls.filter(c=>c.method==="patch").length===1');
      assert.equal(await ui.evaluate('usersTest.assignments.length'), 3);
    });
  } finally { await ui.close(); }
});

test('Presentación inicial, cambio de docente sin residuos y reintento tras error', { skip: !hasEdge, timeout: 90000 }, async () => {
  const ui = await authBrowser('teacherAssignmentsHarness.jsx');
  const history = `document.querySelector('[aria-label="Asignaciones registradas"]')`;
  try {
    await ui.navigate('/login');
    await ui.evaluate(`usersTest.users[2].activo=true;
      usersTest.assignments.push({...usersTest.assignments[0],id:'historica',fecha_inicio:'2025-03-01',fecha_fin:'2025-12-31'},
        {...usersTest.assignments[0],id:'otro',usuario_id:usersTest.users[2].id,seccion_id:usersTest.sections[3].id,fecha_inicio:'2026-05-01'});`);
    await ui.login(); await ui.setRoute('/asignaciones-docentes'); await ready(ui);
    assert.equal(await ui.evaluate(`Boolean(${history})`), false);
    assert.equal(await ui.evaluate('Boolean(document.querySelector("form"))'), false);
    assert.equal(await ui.evaluate('Array.from(document.querySelectorAll("button")).some(e=>e.textContent==="Actualizar")'), false);
    for (const width of [1280, 412, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
      assert.ok(await ui.evaluate('document.documentElement.scrollWidth<=innerWidth'));
      const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/assignments-initial-${width}.png`, Buffer.from(shot.data, 'base64'));
    }
    await fill(ui, 'Docente o auxiliar', '9007199254741001'); await ui.wait(`Boolean(${history})`);
    assert.equal(await ui.evaluate(`${history}.querySelectorAll('li').length`), 2);
    assert.match(await ui.evaluate(`${history}.textContent`), /Vigente.*Finalizada/);
    assert.doesNotMatch(await ui.evaluate(`${history}.textContent`), /01\/05\/2026/);
    await fill(ui, 'Fecha de inicio', '2026-11-22'); await fill(ui, 'Fecha de fin', '2026-12-15');
    await ui.evaluate('document.querySelector("input[type=checkbox]").click()');
    await fill(ui, 'Docente o auxiliar', '9007199254741002');
    await ui.wait('Boolean(document.querySelector("dialog[open]"))');
    await ui.click('Salir sin guardar'); await ui.wait('document.body.textContent.includes("Asignaciones de Luis")');
    assert.equal(await ui.evaluate(`${field('Fecha de inicio')}.value`), '');
    assert.equal(await ui.evaluate(`${field('Fecha de fin')}.value`), '');
    assert.equal(await ui.evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 0);
    assert.equal(await ui.evaluate(`${history}.querySelectorAll('li').length`), 1);
    assert.match(await ui.evaluate(`${history}.textContent`), /01\/05\/2026/);
    await fill(ui, 'Docente o auxiliar', '9007199254741001'); await ui.wait('document.body.textContent.includes("Asignaciones de María")');
    assert.equal(await ui.evaluate(`${field('Fecha de inicio')}.value`), '');
    assert.equal(await ui.evaluate('document.querySelectorAll("input[type=checkbox]:checked").length'), 0);
    await ui.click('Volver al listado'); await ui.wait(`!${history}`);
    await ui.evaluate('usersTest.status=500');
    await ui.setRoute('/inicio'); await ui.wait('location.pathname==="/inicio"');
    await ui.setRoute('/asignaciones-docentes'); await ui.wait('Boolean(document.querySelector("[role=alert]"))');
    await ui.wait('Array.from(document.querySelectorAll("button")).some(e=>e.textContent==="Reintentar consulta")');
    await ui.evaluate('usersTest.status=null'); await ui.click('Reintentar consulta'); await ready(ui);
    assert.equal(await ui.evaluate(`Boolean(${history})`), false);
    assert.equal(await ui.evaluate('usersTest.calls.every(c=>c.method==="get")'), true);
  } finally { await ui.close(); }
});

test('Asignaciones docentes: matriz propia y niveles adicionales ignorados; otros roles sin operación', { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('teacherAssignmentsHarness.jsx');
  try {
    await ui.navigate('/login');
    for (const [level, expected] of [['INICIAL', ['INICIAL']], ['PRIMARIA', ['INICIAL', 'PRIMARIA']], ['SECUNDARIA', ['SECUNDARIA']]]) {
      await ui.evaluate(`usersTest.level=${JSON.stringify(level)};usersTest.users[1].nivel_asignado=null`);
      await ui.login(); await ui.setRoute('/asignaciones-docentes'); await ready(ui);
      await fill(ui, 'Docente o auxiliar', '9007199254741001'); await ui.wait('Boolean(document.querySelector("form"))');
      const selected = await ui.evaluate('Array.from(document.querySelectorAll("input[type=checkbox]")).map(e=>e.closest("label").textContent)');
      const labels = { INICIAL: 'Inicial', PRIMARIA: 'Primaria', SECUNDARIA: 'Secundaria' };
      for (const key of Object.keys(labels)) assert.equal(selected.some(text => text.includes(labels[key])), expected.includes(key));
      await ui.click('Cerrar sesión'); await ui.wait('location.pathname==="/login"');
    }
    for (const role of ['ADMIN', 'REGISTRADOR']) {
      await ui.evaluate(`usersTest.role=${JSON.stringify(role)}`); await ui.login();
      const count = await ui.evaluate('usersTest.calls.filter(c=>c.url.startsWith("/asignaciones")).length');
      assert.equal(await ui.evaluate('Boolean(document.querySelector("a[href=\\"/asignaciones-docentes\\"]"))'), false);
      await ui.setRoute('/asignaciones-docentes'); await ui.wait('location.pathname==="/inicio"');
      assert.equal(await ui.evaluate('usersTest.calls.filter(c=>c.url.startsWith("/asignaciones")).length'), count);
      await ui.click('Cerrar sesión'); await ui.wait('location.pathname==="/login"');
    }
  } finally { await ui.close(); }
});
