import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';

test('6B.2B: respuestas tardías no cruzan cuentas ni restauran datos sin permiso',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await attendanceBrowser();
    const { evaluate, rows, wait, click, choose } = ui;
    async function anotherAccount() {
      await evaluate('attendanceTest.account = String(Number(attendanceTest.account) + 1); attendanceTest.render()');
      await wait(`${rows}.length === 0`); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
    }
    try {
      await t.test('PATCH tardío no sustituye la sesión de una cuenta nueva', async () => {
        await ui.reset('attendanceTest.holdPatch = true'); await choose(0, 'Presente'); await click('Guardar avances');
        await wait('Boolean(attendanceTest.releasePatch)'); await anotherAccount();
        await evaluate('attendanceTest.releasePatch()'); await wait('attendanceTest.server.sesion.version === 8');
        assert.equal((await ui.values())[0], 'Sin marcar'); assert.equal(await ui.dirty(), 0);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Avances guardados correctamente/);
      });
      await t.test('GET tardío no conserva conflictos de la cuenta anterior', async () => {
        await ui.reset('attendanceTest.holdRead = true'); await choose(0, 'Presente');
        await evaluate('attendanceTest.externalMark(0, "TARDANZA")'); await click('Guardar avances');
        await wait('Boolean(attendanceTest.releaseRead)'); await anotherAccount();
        await evaluate('attendanceTest.releaseRead()'); await ui.settled();
        assert.equal((await ui.values())[0], 'Tardanza'); assert.equal(await ui.dirty(), 0);
        assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Revisión de diferencias"]').length`), 0);
      });
      await t.test('revocación durante PATCH invalida la vista; su respuesta no restaura estudiantes', async () => {
        await ui.reset('attendanceTest.holdPatch = true'); await choose(0, 'Falta'); await click('Guardar avances');
        await wait('Boolean(attendanceTest.releasePatch)');
        await evaluate('attendanceTest.allow = false; window.dispatchEvent(new Event("focus"))');
        await wait('document.body.textContent.includes("ya no está disponible")');
        await evaluate('attendanceTest.releasePatch()'); await wait('attendanceTest.server.sesion.version === 8');
        assert.equal(await evaluate(`${rows}.length`), 0);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez|Avances guardados correctamente/);
      });
    } finally { await ui.close(); }
  });
