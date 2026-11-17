import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';
import { selection } from './support/attendanceFixture.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('6B.4B: un GET de autorización tardío no cruza fecha, sección ni cuenta',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await attendanceBrowser();
    const { evaluate, wait, click, rows } = ui;
    async function hold() {
      await ui.reset('attendanceTest.holdRead = true');
      await evaluate('window.dispatchEvent(new Event("focus"))'); await wait('Boolean(attendanceTest.releaseRead)');
    }
    async function releaseAndCheck() {
      await evaluate('attendanceTest.holdRead = false; attendanceTest.releaseRead()');
      // Otro roundtrip permite procesar la respuesta anterior sin tiempos de espera arbitrarios.
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.equal(await evaluate(`${rows}.length`), 4); assert.equal((await ui.values())[0], 'Tardanza');
      assert.doesNotMatch(await evaluate('document.body.textContent'), /Acceso a la sesión comprobado|Revisa las diferencias/);
    }
    const fresh = 'attendanceTest.server.padron[0].estado = "TARDANZA"; attendanceTest.server.sesion.id = "9007199254741000"; attendanceTest.summary()';
    try {
      await t.test('nueva fecha no recibe el padrón ni el mensaje del GET anterior', async () => {
        await hold();
        await evaluate(`const input = document.querySelector('input[type=date]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2026-11-12');
          input.dispatchEvent(new Event('change', { bubbles: true }));`);
        await wait(`${rows}.length === 0`);
        await evaluate(`${fresh}; attendanceTest.server.sesion.fecha = "2026-11-12"`);
        await click('Abrir asistencia'); await wait(`${rows}.length === 4`); await releaseAndCheck();
        assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-11-12');
        await evaluate(`const original = document.querySelector('input[type=date]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(original, '2026-11-13');
          original.dispatchEvent(new Event('change', { bubbles: true }));`);
        await wait(`${rows}.length === 0`);
      });
      await t.test('nueva sección no recibe la respuesta de la sección anterior', async () => {
        await hold();
        const next = { ...selection, section: { ...selection.section, id: '3', grado: 5, letra: 'GENIALES' } };
        await evaluate(`attendanceTest.extraSections = [${JSON.stringify(next.section)}]; void attendanceTest.selectSection(${JSON.stringify(next)})`);
        await wait(`${rows}.length === 0 && document.body.textContent.includes('GENIALES')`);
        await evaluate(`${fresh}; attendanceTest.server.sesion.seccion_id = "3"`);
        await click('Abrir asistencia'); await wait(`${rows}.length === 4`); await releaseAndCheck();
        assert.match(await evaluate('document.querySelector("h2").textContent'), /GENIALES/);
        await evaluate(`void attendanceTest.selectSection(${JSON.stringify(selection)})`);
        await wait(`document.querySelector('h2')?.textContent.includes('CREATIVOS')`);
      });
      await t.test('cambio de cuenta invalida el GET pendiente', async () => {
        await hold();
        await evaluate(`${fresh}; attendanceTest.account = String(Number(attendanceTest.account) + 1); attendanceTest.render()`);
        await wait(`${rows}.length === 0`); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
        await releaseAndCheck();
      });
    } finally { await ui.close(); }
  });
