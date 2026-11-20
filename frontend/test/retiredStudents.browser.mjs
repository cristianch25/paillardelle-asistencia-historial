import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('retirados: respuestas fuera de orden, cambio de sección y errores de consulta',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 180000 }, async t => {
    const ui = await authBrowser('retiredStudentsHarness.jsx');
    const { evaluate, wait, click } = ui;
    const panel = 'document.querySelector(\'[aria-label="Estudiantes retirados"]\')';
    const texto = () => evaluate(`${panel}?.textContent ?? ''`);
    async function preparar(rol = 'ADMIN') {
      await evaluate('retiredTest.select(null); retiredTest.checking(false)');
      await wait(`!${panel}`);
      await evaluate(`retiredTest.calls = []; retiredTest.pending = []; retiredTest.role('${rol}'); retiredTest.select('A')`);
      await wait('retiredTest.pending.length === 1');
    }
    try {
      await ui.navigate('/inicio');
      await wait('typeof retiredTest.select === "function"');
      for (const rol of ['ADMIN', 'SUBDIRECCION']) {
        await t.test(`${rol}: la respuesta atrasada de A no sustituye los retirados de B`, async () => {
          await preparar(rol);
          await evaluate('retiredTest.select("B")');
          await wait('retiredTest.pending.length === 2');
          await evaluate('retiredTest.answer(1, "ok", "Actual B")');
          assert.match(await texto(), /Actual B/);
          await evaluate('retiredTest.answer(0, "ok", "Antiguo A")');
          assert.match(await texto(), /Actual B/);
          assert.doesNotMatch(await texto(), /Antiguo A/);
        });
      }
      await t.test('limpia A inmediatamente mientras B está cargando', async () => {
        await preparar();
        await evaluate('retiredTest.answer(0, "ok", "Visible A")');
        assert.match(await texto(), /Visible A/);
        await evaluate('retiredTest.select("B")');
        await wait('retiredTest.pending.length === 2');
        assert.match(await texto(), /Cargando estudiantes retirados/);
        assert.doesNotMatch(await texto(), /Visible A|No hay estudiantes retirados/);
        await evaluate('retiredTest.answer(1, "empty")');
        assert.match(await texto(), /No hay estudiantes retirados en esta sección/);
        assert.equal(await evaluate(`${panel}.querySelector('[role=alert]')`), null);
      });
      await t.test('un error tardío de A no sustituye el resultado de B', async () => {
        await preparar();
        await evaluate('retiredTest.select("B")');
        await wait('retiredTest.pending.length === 2');
        await evaluate('retiredTest.answer(1, "ok", "Actual B")');
        await evaluate('retiredTest.answer(0, 403)');
        assert.match(await texto(), /Actual B/);
        assert.equal(await evaluate(`${panel}.querySelector('[role=alert]')`), null);
      });
      await t.test('A → B → A distingue la petición nueva de la primera petición de A', async () => {
        await preparar();
        await evaluate('retiredTest.select("B")');
        await wait('retiredTest.pending.length === 2');
        await evaluate('retiredTest.select("A")');
        await wait('retiredTest.pending.length === 3');
        await evaluate('retiredTest.answer(2, "ok", "Actual A")');
        await evaluate('retiredTest.answer(0, "ok", "Antiguo A")');
        await evaluate('retiredTest.answer(1, "ok", "Antiguo B")');
        assert.match(await texto(), /Actual A/);
        assert.doesNotMatch(await texto(), /Antiguo/);
      });
      for (const status of ['network', 403, 404, 500, 'invalid']) {
        await t.test(`error ${status}: no se presenta como vacío y reintenta solo retirados`, async () => {
          await preparar();
          await evaluate(`retiredTest.answer(0, ${JSON.stringify(status)})`);
          assert.equal(await evaluate(`Boolean(${panel}.querySelector('[role=alert]'))`), true);
          assert.doesNotMatch(await texto(), /No hay estudiantes retirados|Detalle técnico ficticio/);
          const otras = await evaluate('retiredTest.calls.filter(c => !c.url.endsWith("/retirados")).length');
          await click('Reintentar retirados');
          await wait('retiredTest.pending.length === 2');
          assert.match(await texto(), /Cargando estudiantes retirados/);
          await evaluate('retiredTest.answer(1, "empty")');
          assert.match(await texto(), /No hay estudiantes retirados/);
          assert.equal(await evaluate('retiredTest.calls.filter(c => !c.url.endsWith("/retirados")).length'), otras);
        });
      }
      await t.test('sin selección descarta la respuesta pendiente y no inicia otra consulta', async () => {
        await preparar();
        await evaluate('retiredTest.select(null)');
        await wait(`!${panel}`);
        await evaluate('retiredTest.answer(0)');
        assert.equal(await evaluate(`Boolean(${panel})`), false);
        assert.equal(await evaluate('retiredTest.pending.length'), 1);
      });
      await t.test('REGISTRADOR no consulta retirados ni recibe una respuesta anterior de ADMIN', async () => {
        await preparar();
        await evaluate('retiredTest.role("REGISTRADOR")');
        await wait(`!${panel}`);
        await evaluate('retiredTest.answer(0, "ok", "Anterior ADMIN")');
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Anterior ADMIN|Estudiantes retirados/);
        assert.equal(await evaluate('retiredTest.pending.length'), 1);
      });
      assert.equal(await evaluate('retiredTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
