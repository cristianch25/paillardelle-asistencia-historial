import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('6B.4B: revalidación histórica sin POST automático ni pérdida de borrador',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 90000 }, async t => {
    const ui = await attendanceBrowser();
    const { evaluate, wait, click, rows, button } = ui;
    const reads = () => evaluate('attendanceTest.calls.filter(c => c.method === "get" && c.url.includes("/sesiones/")).length');
    async function focus() { await evaluate('window.dispatchEvent(new Event("focus"))'); }
    const checked = () => wait('document.body.textContent.includes("Acceso a la sesión comprobado")');
    try {
      await t.test('403/404 históricos retiran el padrón aunque la sección siga autorizada hoy', async () => {
        for (const status of [403, 404]) {
          await ui.reset(`attendanceTest.readStatus = ${status}`); await ui.choose(0, 'Presente'); await focus();
          await wait('document.body.textContent.includes("no está disponible para tu cuenta")');
          assert.equal(await evaluate('attendanceTest.allow'), true);
          assert.equal(await evaluate(`${rows}.length`), 0); assert.doesNotMatch(await evaluate('document.body.textContent'), /Pérez/);
          assert.equal(await reads(), 1);
          assert.equal(await evaluate('attendanceTest.calls.filter(c => c.method === "post").length'), 1);
        }
      });
      await t.test('red/500 no revocan acceso ni borrador; consulta posterior conserva selecciones', async () => {
        for (const failure of ['network', 500]) {
          await ui.reset(`attendanceTest.readStatus = ${JSON.stringify(failure)}`); await ui.choose(0, 'Falta'); await focus();
          await wait(`Boolean(${button('Consultar estado actual')})`);
          assert.equal(await ui.dirty(), 1); assert.equal(await evaluate(`${rows}.length`), 4);
          assert.equal(await evaluate(`${button('Guardar avances')}.disabled`), true);
          assert.match(await evaluate('document.body.textContent'), /No se pudo comprobar el acceso/);
          await evaluate('attendanceTest.readStatus = null'); await click('Consultar estado actual'); await checked();
          assert.equal(await ui.dirty(), 1); assert.equal((await ui.values())[0], 'Falta');
          assert.equal(await reads(), 2);
        }
      });
      await t.test('revalidación exitosa conserva borrador, actualiza versiones y no repite GET al terminar', async () => {
        await ui.reset(); await ui.choose(0, 'Presente');
        await evaluate('attendanceTest.externalMark(2, "FALTA")'); await focus(); await checked();
        assert.equal(await ui.dirty(), 1); assert.equal((await ui.values())[0], 'Presente');
        assert.equal((await ui.values())[2], 'Falta'); assert.equal(await reads(), 1);
        await click('Guardar avances'); await wait('document.body.textContent.includes("Avances guardados correctamente")');
        assert.equal((await ui.patches())[0].body.version, 8); assert.equal(await reads(), 1);
        assert.equal(await evaluate('attendanceTest.calls.filter(c => c.method === "post").length'), 1);
      });
      await t.test('un conflicto sin resolver sobrevive a nuevas comprobaciones de acceso', async () => {
        await ui.reset(); await ui.choose(0, 'Presente'); await evaluate('attendanceTest.externalMark(0, "TARDANZA")');
        await focus(); await checked();
        assert.match(await evaluate('document.body.textContent'), /Estado actual: Tardanza.*Tu selección: Presente/);
        const previous = await reads(); await focus(); await wait(`attendanceTest.calls.filter(c => c.method === "get" && c.url.includes("/sesiones/")).length > ${previous}`);
        await checked(); assert.equal(await evaluate(`${button('Guardar avances')}.disabled`), true);
        assert.equal(await ui.dirty(), 1);
      });
      await t.test('múltiples focos durante un GET no superponen consultas', async () => {
        await ui.reset('attendanceTest.holdRead = true'); await focus(); await wait('Boolean(attendanceTest.releaseRead)');
        await evaluate('window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus"))');
        await evaluate('attendanceTest.holdRead = false; attendanceTest.releaseRead()'); await checked();
        assert.equal(await reads(), 1);
        assert.equal(await evaluate('attendanceTest.calls.filter(c => c.method === "post").length'), 1);
      });
      await t.test('401 del GET usa la invalidación de autenticación existente', async () => {
        await ui.reset('attendanceTest.readStatus = 401'); await focus(); await wait('attendanceTest.unauthorized === true');
        assert.equal(await evaluate(`${rows}.length`), 0);
      });
    } finally { await ui.close(); }
  });
