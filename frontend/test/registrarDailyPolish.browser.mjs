import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';
import { data } from './support/attendanceFixture.mjs';

test('Diálogo masivo: mensaje breve y botones cómodos en una fila en móvil y escritorio', { skip: !hasEdge, timeout: 60000 }, async () => {
  const ui = await authBrowser('mobileAttendanceHarness.jsx'), { evaluate, wait, click } = ui;
  const fixture = structuredClone(data);
  fixture.padron[1].estado = 'PENDIENTE'; fixture.resumen.presentes = 0; fixture.resumen.pendientes = 2;
  const dialog = `document.querySelector('dialog[open]')`;
  try {
    await ui.navigate('/login'); await ui.login(); await evaluate(`mobileTest.stores['2:2026-11-13']=${JSON.stringify(fixture)}`);
    await ui.setRoute('/secciones'); await wait('Boolean(document.querySelector("input[type=date]"))');
    await evaluate(`(()=>{const e=document.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-11-13');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait('document.querySelectorAll(\'ul[aria-label="Secciones disponibles"] > li\').length===2');
    await evaluate('document.querySelector(\'ul[aria-label="Secciones disponibles"] > li button\').click()');
    await wait('document.querySelectorAll(\'[aria-label="Estudiantes y marcas actuales"] > li\').length===4');
    await click('Marcar todos como presentes'); await wait(`Boolean(${dialog})`);
    assert.equal(await evaluate(`${dialog}.querySelector('p').textContent`), 'Se marcarán como presentes 2 estudiantes que aún están sin marcar');
    assert.deepEqual(await evaluate(`Array.from(${dialog}.querySelectorAll('button')).map(e=>e.textContent)`), ['Cancelar', 'Confirmar']);
    for (const width of [1280, 412, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      assert.ok(await evaluate(`${dialog}.scrollWidth<=${dialog}.clientWidth`));
      assert.ok(await evaluate(`(()=>{const [a,b]=${dialog}.querySelectorAll('button');return Math.abs(a.getBoundingClientRect().top-b.getBoundingClientRect().top)<1&&a.getBoundingClientRect().height>=44&&b.getBoundingClientRect().height>=44})()`));
      const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(`node_modules/.tmp/registrar-bulk-brief-${width}.png`, Buffer.from(shot.data, 'base64'));
    }
    await click('Cancelar'); await wait(`!${dialog}`);
    assert.equal(await evaluate('mobileTest.calls.filter(c=>c.method!=="get").length'), 0);
    assert.equal(await evaluate('mobileTest.stores["2:2026-11-13"].padron[0].estado'), 'PENDIENTE');
  } finally { await ui.close(); }
});

test('REGISTRADOR: buscador, Volver y masivo integrado preservan marcas y guardado explícito', { skip: !hasEdge, timeout: 90000 }, async t => {
  const fixture = structuredClone(data);
  fixture.padron[3].justificada = true; fixture.padron[3].motivo_justificacion = 'Aviso ficticio';
  fixture.padron.forEach((row, index) => { row.estudiante.codigo_estudiante = `PRUEBA-${index}`; });
  const ui = await authBrowser('mobileAttendanceHarness.jsx'), { evaluate, wait, click } = ui;
  const rows = `document.querySelectorAll('[aria-label="Estudiantes y marcas actuales"] > li')`;
  const dialog = `document.querySelector('dialog[open]')`;
  const bulk = `Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Marcar todos como presentes')`;
  const writes = () => evaluate('mobileTest.calls.filter(c=>["post","patch"].includes(c.method)).length');
  const values = () => evaluate(`Array.from(${rows}).map(e=>e.querySelector('[aria-pressed=true]')?.textContent.trim() ?? 'Sin marcar')`);
  async function input(type, value) {
    await evaluate(`(()=>{const e=document.querySelector('input[type=${type}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  try {
    await ui.navigate('/login'); await ui.login(); await evaluate(`mobileTest.stores['2:2026-11-13']=${JSON.stringify(fixture)}`);
    await ui.setRoute('/secciones'); await wait('document.querySelectorAll(\'ul[aria-label="Secciones disponibles"] > li\').length===2');
    await input('date', '2026-11-13');
    await evaluate('document.querySelector(\'ul[aria-label="Secciones disponibles"] > li button\').click()'); await wait(`${rows}.length===4`);
    await evaluate('window.nativePrompts=[];window.confirm=message=>{nativePrompts.push(message);return false}');
    await t.test('presentación responsive, búsqueda por código y navegación conservada', async () => {
      const before = await evaluate('mobileTest.calls.length'); await input('search', 'PRUEBA-2'); await wait(`${rows}.length===1`);
      assert.match(await evaluate(`${rows}[0].textContent`), /Pérez 2/);
      assert.equal(await evaluate('mobileTest.calls.length'), before);
      await input('search', ''); await wait(`${rows}.length===4`);
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        assert.ok(await evaluate('(()=>{const e=document.querySelector("input[type=search]");return parseFloat(getComputedStyle(e).borderRadius)>=e.getBoundingClientRect().height/2})()'));
        assert.ok(await evaluate(`parseFloat(getComputedStyle(${bulk}).borderRadius)>=${bulk}.getBoundingClientRect().height/2`));
        assert.equal(await evaluate('document.querySelector("#main-content header a")'), null);
        assert.equal(await evaluate('Boolean(document.querySelector("#main-content header button .lucide-arrow-left"))'), true);
        const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-daily-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
    });
    await t.test('cancelación y Escape conservan todas las marcas y restauran el foco', async () => {
      const before = await values(); await evaluate(`${bulk}.focus()`); await click('Marcar todos como presentes'); await wait(`Boolean(${dialog})`);
      assert.equal(await evaluate(`${dialog}.querySelector('p').textContent`), 'Se marcarán como presentes 1 estudiantes que aún están sin marcar');
      assert.equal(await evaluate('document.activeElement.textContent'), 'Cancelar');
      assert.equal(await evaluate('document.activeElement.className.includes("bg-white")'), true);
      await click('Cancelar'); await wait(`!${dialog}`); assert.deepEqual(await values(), before);
      assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Marcar todos como presentes');
      await click('Marcar todos como presentes'); await wait(`Boolean(${dialog})`);
      await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await wait(`!${dialog}`); assert.deepEqual(await values(), before); assert.equal(await writes(), 0);
    });
    await t.test('confirmar incluye ocultos, conserva otras marcas y no guarda automáticamente', async () => {
      await input('search', 'PRUEBA-2'); await wait(`${rows}.length===1`);
      await click('Marcar todos como presentes'); await wait(`Boolean(${dialog})`);
      assert.doesNotMatch(await evaluate(`${dialog}.textContent`), /búsqueda|demás marcas|Guardar cambios/);
      for (const width of [1280, 412, 320]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate(`${dialog}.scrollWidth<=${dialog}.clientWidth`));
        const shot = await ui.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-bulk-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
      await click('Confirmar'); await wait(`!${dialog}`); assert.equal(await writes(), 0);
      assert.equal(await evaluate('document.activeElement.id'), 'main-content');
      assert.match(await evaluate('document.body.textContent'), /1 cambio sin guardar/);
      await input('search', ''); await wait(`${rows}.length===4`);
      assert.deepEqual(await values(), ['Presente', 'Presente', 'Tardanza', 'Falta']);
      assert.equal(await evaluate(`${bulk}.disabled`), true);
      assert.equal(await evaluate('nativePrompts.length'), 0);
      assert.equal(await evaluate('mobileTest.stores["2:2026-11-13"].padron[0].estado'), 'PENDIENTE');
    });
    await t.test('Volver protege cambios y Guardar cambios sigue siendo necesario', async () => {
      await click('Volver'); await wait(`Boolean(${dialog})`);
      assert.match(await evaluate(`${dialog}.textContent`), /Salir sin guardar/); await click('Continuar registrando');
      assert.equal(await evaluate('location.pathname'), '/asistencias/diaria');
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      assert.equal(await writes(), 1);
      const changes = await evaluate('mobileTest.calls.find(c=>c.method==="patch").body.cambios');
      assert.deepEqual(changes, [{ asistencia_id: fixture.padron[0].asistencia_id, version: 0, estado: 'PRESENTE' }]);
      await click('Volver'); await wait('location.pathname==="/secciones"');
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-11-13');
    });
  } finally { await ui.close(); }
});
