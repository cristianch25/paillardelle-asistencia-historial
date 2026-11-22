import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';
import { data } from './support/attendanceFixture.mjs';

test('Registro compacto: estados, anulación individual y guardado parcial confirmado', { skip: !hasEdge, timeout: 90000 }, async t => {
  const ui = await authBrowser('mobileAttendanceHarness.jsx'), { evaluate, wait, click, command } = ui;
  const fixture = structuredClone(data);
  fixture.padron.forEach((row, index) => { row.estudiante.codigo_estudiante = `PRUEBA-${index}`; });
  fixture.padron[3].justificada = true; fixture.padron[3].motivo_justificacion = 'Aviso ficticio';
  const rows = `document.querySelectorAll('[aria-label="Estudiantes y marcas actuales"] > li')`;
  const dialog = `document.querySelector('dialog[open]')`;
  const writes = () => evaluate('mobileTest.calls.filter(c=>["post","patch"].includes(c.method)).length');
  async function field(type, value) {
    await evaluate(`(()=>{const e=document.querySelector('input[type=${type}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function rowClick(index, label) {
    await evaluate(`Array.from(${rows}[${index}].querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(label)}).click()`);
  }
  try {
    await ui.navigate('/login'); await ui.login();
    await evaluate(`mobileTest.stores['2:2026-11-13']=${JSON.stringify(fixture)}`);
    await ui.setRoute('/secciones'); await wait('Boolean(document.querySelector("input[type=date]"))');
    await field('date', '2026-11-13');
    await wait('Boolean(document.querySelector(\'ul[aria-label="Secciones disponibles"] > li button\'))');
    await evaluate('document.querySelector(\'ul[aria-label="Secciones disponibles"] > li button\').click()');
    await wait(`${rows}.length===4`);
    await t.test('tres estados en una fila y áreas táctiles de 44 px a 320, 412 y 1280', async () => {
      assert.deepEqual(await evaluate(`Array.from(${rows}).map(r=>r.querySelector('[aria-pressed=true]')?.textContent.trim()??'Sin marcar')`), ['Sin marcar', 'Presente', 'Tardanza', 'Falta']);
      assert.equal(await evaluate(`${rows}[0].textContent.includes('Quitar marca')`), false);
      assert.equal(await evaluate(`Array.from(${rows}[3].querySelectorAll('button')).every(e=>e.disabled)`), true);
      for (const width of [320, 412, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        const layout = await evaluate(`Array.from(${rows}).map(r=>{const buttons=Array.from(r.querySelectorAll('[role=group] button'));return {labels:buttons.map(e=>e.textContent.trim()),rects:buttons.map(e=>{const a=e.getBoundingClientRect();return {top:a.top,height:a.height,width:a.width,overflow:e.scrollWidth>e.clientWidth}})}})`);
        for (const row of layout) {
          assert.deepEqual(row.labels, ['Presente', 'Tardanza', 'Falta']);
          assert.ok(row.rects.every(a=>a.height>=44 && !a.overflow && Math.abs(a.top-row.rects[0].top)<1));
        }
        assert.ok(await evaluate(`Array.from(${rows}).slice(1).every(r=>{
          const clear=Array.from(r.querySelectorAll('button')).find(e=>e.textContent.trim()==='Quitar marca').getBoundingClientRect();
          const label=r.querySelector('label'), bounds=r.getBoundingClientRect();
          return label ? Math.abs(clear.top-label.getBoundingClientRect().top)<1
            : Math.abs(clear.right-(bounds.right-parseFloat(getComputedStyle(r).paddingRight)-1))<2;
        })`));
        const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-compact-rows-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
    });
    await t.test('quitar una marca es individual, reversible y no escribe', async () => {
      await rowClick(1, 'Quitar marca'); await wait(`!${rows}[1].querySelector('[aria-pressed=true]')`);
      assert.equal(await evaluate(`${rows}[1].textContent.includes('Quitar marca')`), false);
      assert.equal(await writes(), 0);
      await rowClick(1, 'Presente'); await wait('document.body.textContent.includes("0 cambios sin guardar")');
      await rowClick(0, 'Falta'); await rowClick(1, 'Quitar marca');
      assert.equal(await evaluate(`${rows}[0].querySelector('input[type=checkbox]').checked`), false);
      assert.equal(await evaluate('mobileTest.stores["2:2026-11-13"].padron[0].estado'), 'PENDIENTE');
    });
    await t.test('cuenta los pendientes ocultos; revisar y Escape no guardan ni pierden el borrador', async () => {
      await field('search', 'PRUEBA-0'); await wait(`${rows}.length===1`);
      await click('Guardar cambios'); await wait(`Boolean(${dialog})`);
      assert.equal(await evaluate(`${dialog}.querySelector('p').textContent`), 'Quedan 1 estudiantes sin marcar. ¿Deseas guardar de todas formas?');
      assert.deepEqual(await evaluate(`Array.from(${dialog}.querySelectorAll('button')).map(e=>e.textContent)`), ['Volver a revisar', 'Guardar igualmente']);
      assert.equal(await evaluate('document.activeElement.textContent'), 'Volver a revisar');
      await click('Volver a revisar'); await wait(`!${dialog}`);
      assert.equal(await writes(), 0); assert.match(await evaluate('document.body.textContent'), /2 cambios sin guardar/);
      await click('Guardar cambios'); await wait(`Boolean(${dialog})`);
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await wait(`!${dialog}`); assert.equal(await writes(), 0);
    });
    await t.test('guardar igualmente conserva el pendiente y la justificación sigue siendo opcional', async () => {
      await click('Guardar cambios'); await wait(`Boolean(${dialog})`); await click('Guardar igualmente');
      await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      assert.equal(await writes(), 1);
      assert.deepEqual(await evaluate('mobileTest.stores["2:2026-11-13"].padron.map(r=>r.estado)'), ['FALTA', 'PENDIENTE', 'TARDANZA', 'FALTA']);
      assert.equal(await evaluate('mobileTest.stores["2:2026-11-13"].padron[0].justificada'), false);
      assert.equal(await evaluate(`${ui.button('Guardar cambios')}.disabled`), true);
      await click('Guardar cambios'); assert.equal(await evaluate(`Boolean(${dialog})`), false);
    });
    await t.test('masivo mantiene su confirmación; sin pendientes el guardado no pide aviso', async () => {
      await click('Marcar todos como presentes'); await wait(`Boolean(${dialog})`);
      assert.match(await evaluate(`${dialog}.textContent`), /Se marcarán como presentes 1 estudiantes/);
      await click('Confirmar'); await wait(`!${dialog}`); assert.equal(await writes(), 1);
      await click('Guardar cambios'); await wait('mobileTest.calls.filter(c=>c.method==="patch").length===2');
      assert.equal(await evaluate(`Boolean(${dialog})`), false);
      assert.deepEqual(await evaluate('mobileTest.stores["2:2026-11-13"].padron.map(r=>r.estado)'), ['FALTA', 'PRESENTE', 'TARDANZA', 'FALTA']);
    });
    await t.test('cantidad dinámica y confirmación invalidada al reconsultar la lista', async () => {
      await wait('document.body.textContent.includes("0 cambios sin guardar")');
      await field('search', ''); await wait(`${rows}.length===4`);
      await rowClick(0, 'Quitar marca'); await rowClick(1, 'Quitar marca');
      await click('Guardar cambios'); await wait(`Boolean(${dialog})`);
      assert.equal(await evaluate(`${dialog}.querySelector('p').textContent`), 'Quedan 2 estudiantes sin marcar. ¿Deseas guardar de todas formas?');
      await evaluate(`window.dispatchEvent(new Event('focus'))`); await wait(`!${dialog}`);
      assert.equal(await writes(), 2);
      await wait('document.body.textContent.includes("2 cambios sin guardar")');
      assert.equal(await evaluate(`${rows}[0].querySelector('[aria-pressed=true]')`), null);
    });
  } finally { await ui.close(); }
});
