import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('REGISTRADOR: padrón con búsqueda local e historial académico exclusivamente de consulta', { skip: !hasEdge, timeout: 90000 }, async t => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click, command } = ui;
  const list = `document.querySelector('[aria-label="Estudiantes de la fecha consultada"]')`;
  const rows = `${list}.querySelectorAll('ul > li')`;
  const modal = `document.querySelector('dialog[open]:has([aria-label="Historial diario"])')`;
  const search = `${list}.querySelector('input[type=search]')`;
  async function input(selector, value, event = 'input') {
    await evaluate(`(()=>{const e=${selector};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
  }
  async function open() { await evaluate(`(()=>{const b=${rows}[0].querySelector('button');b.focus();b.click()})()`); await wait(`Boolean(${modal})`); }
  try {
    await ui.navigate('/login'); await command('Page.bringToFront');
    await wait('Boolean(window.profileTest)'); await ui.login();
    await evaluate(`(()=>{const rows=navigationTest.server.padron;
      rows.forEach((r,i)=>r.estudiante.codigo_estudiante='FICTICIO-00'+i);
      Object.assign(rows[1].estudiante,{apellido_paterno:rows[0].estudiante.apellido_paterno,apellido_materno:rows[0].estudiante.apellido_materno,nombres:rows[0].estudiante.nombres});})()`);
    await ui.setRoute('/secciones'); await wait('Boolean(document.querySelector("input[type=date]"))');
    await input(`document.querySelector('input[type=date]')`, '2026-11-13', 'change');
    await wait('Boolean(document.querySelector(\'ul[aria-label="Secciones disponibles"] > li\'))');
    await evaluate(`Array.from(document.querySelector('ul[aria-label="Secciones disponibles"] > li').querySelectorAll('button')).find(e=>e.textContent==='Ver estudiantes').click()`);
    await wait(`Boolean(${list}) && Boolean(${search}) && ${rows}.length===4`);
    await t.test('nombre, apellidos y código filtran sin consultas; homónimos conservan código', async () => {
      const before = await evaluate('navigationTest.calls.length');
      assert.match(await evaluate(`${rows}[0].textContent`), /FICTICIO-000/);
      assert.match(await evaluate(`${rows}[1].textContent`), /FICTICIO-001/);
      assert.doesNotMatch(await evaluate(`${rows}[2].textContent`), /Código/);
      assert.doesNotMatch(await evaluate(`${list}.textContent`), /Ver perfil/);
      for (const query of ['ana maria', 'perez rio']) { await input(search, query); await wait(`${rows}.length===4`); }
      await input(search, 'FICTICIO-001'); await wait(`${rows}.length===1`);
      assert.match(await evaluate(`${rows}[0].textContent`), /FICTICIO-001/);
      await input(search, 'NO COINCIDE'); await wait(`${rows}.length===0`);
      assert.match(await evaluate(`${list}.textContent`), /No hay estudiantes que coincidan/);
      await input(search, ''); await wait(`${rows}.length===4`);
      assert.equal(await evaluate('navigationTest.calls.length'), before);
      assert.equal(await evaluate('profileTest.calls.length'), 0);
    });
    await t.test('móvil y escritorio: buscador píldora y nombres destacados', async () => {
      for (const width of [320, 412, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        assert.ok(await evaluate(`parseFloat(getComputedStyle(${search}).borderRadius)>=${search}.getBoundingClientRect().height/2`));
        assert.ok(await evaluate(`parseFloat(getComputedStyle(${search}).paddingLeft)>=44`));
        assert.ok(await evaluate(`(()=>{const i=${list}.querySelector('.lucide-search').getBoundingClientRect(), f=${search}.getBoundingClientRect();return i.left>f.left&&i.right<f.left+44&&Math.abs(i.top+i.height/2-f.top-f.height/2)<3})()`));
        assert.equal(await evaluate(`getComputedStyle(${rows}[0].querySelector('p')).fontWeight`), '600');
        const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-students-search-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
    });
    await t.test('historial mensual con justificaciones, cambios de sección y ningún control de escritura', async () => {
      await input(search, 'FICTICIO-001'); await wait(`${rows}.length===1`);
      await evaluate('profileTest.sectionChange = true'); await open();
      assert.match(await evaluate(`${modal}.textContent`), /Historial de asistencia|Aviso vigente/);
      assert.match(await evaluate(`${modal}.textContent`), /OTRA SECCIÓN/);
      assert.doesNotMatch(await evaluate(`${modal}.textContent`), /Guardar|Apoderado|Marcar todos|Editar celular|Reingresar|Retirar/);
      assert.equal(await evaluate(`${modal}.querySelectorAll('input:not([type=month]),textarea,[aria-pressed]').length`), 0);
      const call = await evaluate('profileTest.calls.filter(c=>c.url.endsWith("/perfil")).at(-1)');
      assert.equal(call.url, '/estudiantes/2/perfil'); assert.equal(call.params.mes, '2026-11');
      for (const width of [320, 412, 1280]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
        assert.ok(await evaluate(`${modal}.scrollWidth<=${modal}.clientWidth`));
        assert.ok(await evaluate(`(()=>{const container=${modal}.querySelector('table').parentElement;container.scrollLeft=container.scrollWidth;return container.scrollWidth<=container.clientWidth||container.scrollLeft>0})()`));
        const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-student-history-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
      await input(`${modal}.querySelector('input[type=month]')`, '2026-10', 'change');
      await wait('profileTest.calls.filter(c=>c.url.endsWith("/perfil")).at(-1).params.mes==="2026-10"');
      await wait(`Boolean(${modal})`); await click('Cerrar'); await wait(`!${modal}`);
      assert.equal(await evaluate(`${search}.value`), 'FICTICIO-001');
      await open();
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await wait(`!${modal}`);
      assert.equal(await evaluate(`${search}.value`), 'FICTICIO-001');
    });
    await t.test('denegación del endpoint no muestra historial ni permite saltar el control', async () => {
      await evaluate('profileTest.status = 404');
      await evaluate(`${rows}[0].querySelector('button').click()`);
      await wait('Boolean(document.querySelector("dialog[open] [role=alert]"))');
      assert.equal(await evaluate(`Boolean(${modal})`), false);
      assert.ok(await evaluate('profileTest.calls.every(c=>c.method==="get")'));
      assert.ok(await evaluate('navigationTest.calls.every(c=>c.method==="get")'));
      await click('Cerrar');
    });
  } finally { await ui.close(); }
});
