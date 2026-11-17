import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';
import { selection } from './support/attendanceFixture.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('6B.2C: cambiar y limpiar sección protegen el borrador; revalidar permisos no pregunta',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 60000 }, async () => {
    const ui = await attendanceBrowser();
    const { evaluate, wait, click, rows } = ui;
    const dialog = `document.querySelector('dialog[open][aria-describedby]')`;
    try {
      await ui.reset(); await ui.choose(0, 'Presente');
      const next = { ...selection, section: { ...selection.section, id: '3', grado: 5, letra: 'GENIALES' } };
      await evaluate(`attendanceTest.extraSections = [${JSON.stringify(next.section)}]; void attendanceTest.selectSection(${JSON.stringify(next)})`);
      await wait(`Boolean(${dialog})`); await click('Continuar registrando'); await wait(`!${dialog}`);
      assert.match(await evaluate('document.body.textContent'), /CREATIVOS/); assert.equal(await ui.dirty(), 1);
      assert.equal(await evaluate('Boolean(document.querySelector("button[aria-describedby=opening-hint]"))'), false);
      await evaluate('window.dispatchEvent(new Event("focus"))'); await wait(`${rows}.length === 4`);
      assert.equal(await evaluate(`Boolean(${dialog})`), false); assert.equal(await ui.dirty(), 1);
      await evaluate(`void attendanceTest.selectSection(${JSON.stringify(next)})`);
      await wait(`Boolean(${dialog})`); await click('Salir sin guardar');
      await wait(`${rows}.length === 0 && document.body.textContent.includes('GENIALES')`);
      assert.equal(await evaluate('document.querySelector("button[aria-describedby=opening-hint]").textContent.trim()'), 'Abrir asistencia');
      assert.equal(await evaluate('attendanceTest.calls.filter(c => c.method === "post").length'), 1);
      await evaluate(`void attendanceTest.selectSection(${JSON.stringify(selection)})`);
      await wait('document.body.textContent.includes("CREATIVOS")'); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
      await ui.choose(0, 'Falta'); await evaluate('attendanceTest.clearSection()');
      await wait(`Boolean(${dialog})`); await click('Continuar registrando'); await wait(`!${dialog}`);
      assert.equal(await ui.dirty(), 1);
      await evaluate('attendanceTest.clearSection()'); await wait(`Boolean(${dialog})`); await click('Salir sin guardar');
      await wait(`${rows}.length === 0`);
      assert.equal(await evaluate('attendanceTest.calls.filter(c => c.method === "patch").length'), 0);
    } finally { await ui.close(); }
  });
