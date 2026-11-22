import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('Ventana unificada: teclado, guardados independientes y borrador protegido', { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click, command } = ui;
  const hit = `document.querySelector('[aria-label="Coincidencias de mis estudiantes"] li button')`;
  const modal = `document.querySelector('dialog[open]:has([aria-label="Asistencia rápida"])')`;
  const editor = `${modal}?.querySelector('[aria-label="Celular del apoderado"]')`;
  const attendanceWrites = `navigationTest.calls.filter(c => c.method === 'patch').length`;
  async function input(selector, value, event = 'input') {
    await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles:true})); })()`);
  }
  async function open() { await evaluate(`${hit}.click()`); await wait(`Boolean(${editor})`); }
  try {
    await ui.navigate('/login'); await wait('Boolean(window.profileTest)'); await ui.login();
    await evaluate(`navigationTest.server.padron[0].estudiante.codigo_estudiante = 'FICTICIO-001'`);
    await ui.setRoute('/asistencias'); await wait('Boolean(document.querySelector("input[type=date]"))');
    await input(`document.querySelector('input[type=date]')`, '2026-11-13', 'change');
    await input(`document.querySelector('input[type=search]')`, 'FICTICIO-001'); await wait(`Boolean(${hit})`);
    await t.test('nombre sin enlace; fila nativa operable con Enter y Espacio', async () => {
      assert.equal(await evaluate(`${hit}.querySelectorAll('a,[role=button]').length`), 0);
      assert.equal(await evaluate(`${hit}.querySelectorAll('.underline').length`), 0);
      await command('Page.bringToFront');
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await wait(`Boolean(${hit})`); await evaluate(`${hit}.focus()`);
      assert.equal(await evaluate(`document.activeElement === ${hit}`), true);
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await wait(`Boolean(${editor})`);
      assert.equal(await evaluate(`${modal}.querySelectorAll('h2').length`), 1);
      const name = await evaluate(`${modal}.querySelector('[aria-label="Asistencia rápida"] li p').textContent`);
      assert.equal(await evaluate(`${modal}.textContent.split(${JSON.stringify(name)}).length - 1`), 1);
      assert.match(await evaluate(`${modal}.textContent`), /Sección: 4 años CREATIVOS · Inicial/);
      assert.equal(await evaluate(`Boolean(document.querySelector('dialog[open] [aria-label="Cerrar perfil"]'))`), false);
      await click('Cerrar'); await wait(`!${modal}`);
      await evaluate(`${hit}.focus()`);
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await wait(`Boolean(${editor})`);
    });
    await t.test('guardar teléfono preserva tardanza sin justificación ni guardado automático', async () => {
      await click('Tardanza'); await wait(`${modal}.textContent.includes('1 cambio')`);
      await evaluate(`${editor}.querySelector('[aria-label="Editar celular"]').click()`);
      await input(`${editor}.querySelector('input')`, '900000008'); await click('Guardar número');
      await wait(`${editor}.textContent.includes('Confirmar cambio')`); await click('Confirmar cambio');
      await wait(`${editor}.textContent.includes('Número actualizado')`);
      assert.equal(await evaluate(attendanceWrites), 0);
      assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'PENDIENTE');
      assert.equal(await evaluate(`${modal}.textContent.includes('1 cambio')`), true);
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Asistencia guardada")');
      assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'TARDANZA');
      assert.equal(await evaluate('navigationTest.server.padron[0].justificada'), false);
      assert.equal(await evaluate('profileTest.phone.writes'), 1);
      assert.equal(await evaluate(attendanceWrites), 1);
      assert.equal(await evaluate(`Boolean(${modal})`), true);
    });
    await t.test('guardar asistencia conserva edición de teléfono sin confirmarla', async () => {
      await evaluate(`${editor}.querySelector('[aria-label="Editar celular"]').click()`);
      await input(`${editor}.querySelector('input')`, '900000009');
      await click('Falta'); await click('Guardar cambios');
      await wait('navigationTest.server.padron[0].estado === "FALTA"');
      await wait(`Boolean(${editor}.querySelector('input:not(:disabled)'))`);
      assert.equal(await evaluate(`${editor}.querySelector('input').value`), '900000009');
      assert.equal(await evaluate('profileTest.phone.value'), '900000008');
      assert.equal(await evaluate('profileTest.phone.writes'), 1);
      await click('Cancelar');
      await click('Presente'); await click('Cerrar');
      await wait(`document.body.textContent.includes('¿Salir sin guardar los cambios?')`);
      await click('Continuar registrando'); await wait(`document.querySelectorAll('dialog[open]').length === 1`);
      assert.equal(await evaluate(`${modal}.textContent.includes('1 cambio')`), true);
      await click('Cerrar'); await wait(`Boolean(${ui.button('Salir sin guardar')})`);
      await click('Salir sin guardar'); await wait(`!${modal}`);
      await open();
      assert.match(await evaluate(`${editor}.textContent`), /900000008/);
      assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'FALTA');
      assert.equal(await evaluate(attendanceWrites), 2);
    });
    await t.test('error del teléfono y recuperación de foco conservan el borrador de asistencia', async () => {
      await click('Tardanza');
      await evaluate(`${editor}.querySelector('[aria-label="Editar celular"]').click()`);
      await input(`${editor}.querySelector('input')`, '900000009'); await click('Guardar número');
      await wait(`${editor}.textContent.includes('Confirmar cambio')`);
      await evaluate('profileTest.phone.hold = true; profileTest.phone.confirmStatus = 409');
      await click('Confirmar cambio'); await wait('profileTest.phone.pending.length === 1');
      await evaluate(`window.dispatchEvent(new Event('focus'))`);
      assert.equal(await evaluate(`${ui.button('Guardar cambios')}.disabled`), true);
      assert.equal(await evaluate(`${ui.button('Cerrar')}.disabled`), true);
      await evaluate('profileTest.phone.hold = false; profileTest.phone.pending.shift()()');
      await wait(`${editor}.textContent.includes('Consultar número actual')`);
      await click('Consultar número actual'); await wait(`${editor}?.textContent.includes('900000008')`);
      assert.equal(await evaluate(`${modal}.textContent.includes('1 cambio')`), true);
      assert.equal(await evaluate(attendanceWrites), 2);
      assert.equal(await evaluate('profileTest.phone.writes'), 1);
      await click('Cerrar'); await wait(`Boolean(${ui.button('Salir sin guardar')})`);
      await click('Salir sin guardar'); await wait(`!${modal}`);
      await evaluate(`${hit}.querySelector('span').click()`); await wait(`Boolean(${editor})`);
      assert.equal(await evaluate('navigationTest.server.padron[0].estado'), 'FALTA');
    });
    await t.test('escritorio y móvil: contacto, nombre único y controles sin desbordar', async () => {
      for (const width of [1280, 412, 320]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
        assert.equal(await evaluate(`${modal}.scrollWidth <= ${modal}.clientWidth`), true);
        assert.equal(await evaluate(`document.documentElement.scrollWidth <= ${width}`), true);
        assert.equal(await evaluate(`${modal}.querySelectorAll('[aria-label="Asistencia rápida"] li').length`), 1);
        const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(`node_modules/.tmp/registrar-unified-student-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
    });
  } finally { await ui.close(); }
});
