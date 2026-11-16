import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supervisionCorrectionBrowser } from './support/supervisionCorrectionBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('7B.1: rechazo, concurrencia, resultado incierto y respuestas antiguas',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await supervisionCorrectionBrowser();
    const { evaluate, wait, click, rows, action, writes } = ui;
    const error = () => wait('Boolean(document.querySelector("#main-content [role=alert]")) && !document.querySelector("dialog[open]")');
    try {
      await ui.navigate('/login'); await ui.signIn();
      for (const status of [400, 413]) await t.test(`rechazo ${status} no altera el detalle ni anuncia éxito`, async () => {
        await ui.load(); await evaluate(`supervisionCorrectionTest.status = ${status}`);
        await ui.edit(); await ui.confirm(); await error();
        assert.equal(await evaluate('supervisionCorrectionTest.server.padron[0].estado'), 'PRESENTE');
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Corrección guardada correctamente|Detalle privado/);
      });
      await t.test('409 requiere consulta y nueva confirmación con las versiones actuales', async () => {
        await ui.load(); await ui.edit();
        await evaluate('supervisionCorrectionTest.server.sesion.version++; supervisionCorrectionTest.server.padron[0].version++');
        const before = await evaluate(`${writes}.length`); await ui.confirm(); await error();
        assert.match(await evaluate('document.body.textContent'), /conflicto de versión o de condiciones/);
        assert.equal(await evaluate(`${rows}.length`), 0); assert.equal(await evaluate(`Boolean(${action})`), false);
        assert.equal(await evaluate(`${writes}.length`), before + 1);
        await click('Consultar estado actual'); await wait(`Boolean(${action})`);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Corrección guardada correctamente/);
        await ui.edit(); await ui.confirm(); await ui.saved();
        assert.equal(await evaluate(`${writes}.at(-1).body.version`), 4);
        assert.equal(await evaluate(`${writes}.at(-1).body.cambios[0].version`), 2);
      });
      for (const status of ['network', 'timeout', 500]) await t.test(`${status} aplicado: consulta explícita sin repetir PATCH ni atribuir éxito`, async () => {
        await ui.load(); await evaluate(`supervisionCorrectionTest.status = ${JSON.stringify(status)}; supervisionCorrectionTest.applyBeforeError = true`);
        await ui.edit(); const before = await evaluate(`${writes}.length`); await ui.confirm(); await error();
        assert.match(await evaluate('document.body.textContent'), /resultado es incierto/);
        await evaluate('supervisionCorrectionTest.readStatus = "network"'); await click('Consultar estado actual'); await error();
        assert.equal(await evaluate(`${rows}.length`), 0);
        await evaluate('supervisionCorrectionTest.readStatus = null'); await click('Consultar estado actual');
        await wait(`Boolean(${action})`); assert.match(await evaluate(`${rows}[0].textContent`), /Falta/);
        assert.equal(await evaluate(`${writes}.length`), before + 1);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Corrección guardada correctamente/);
      });
      await t.test('respuesta de confirmación incompatible exige verificar el estado actual', async () => {
        await ui.load(); await evaluate('supervisionCorrectionTest.malformed = true');
        await ui.edit(); await ui.confirm(); await error();
        assert.equal(await evaluate(`${rows}.length`), 0); assert.match(await evaluate('document.body.textContent'), /resultado es incierto/);
        await click('Consultar estado actual'); await wait(`Boolean(${action})`);
      });
      for (const status of [403, 404]) await t.test(`pérdida de acceso ${status} retira datos y controles`, async () => {
        await ui.load(); await evaluate(`supervisionCorrectionTest.status = ${status}`);
        await ui.edit(); await ui.confirm(); await error();
        assert.equal(await evaluate(`${rows}.length`), 0); assert.equal(await evaluate(`Boolean(${action})`), false);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /ApellidoExtenso/);
        await click('Reintentar detalle'); await wait(`Boolean(${action})`);
      });
      await t.test('401 invalida sesión mediante el cliente compartido', async () => {
        await ui.load(); await evaluate('supervisionCorrectionTest.status = 401');
        await ui.edit(); await ui.confirm(); await wait('location.pathname === "/login"');
        assert.equal(await evaluate(`${rows}.length`), 0); await ui.signIn();
      });
      await t.test('salida durante PATCH se bloquea hasta confirmar; la siguiente sesión no recibe sus datos', async () => {
        await ui.load(); await evaluate('supervisionCorrectionTest.hold = true'); await ui.edit(); await ui.confirm();
        await wait('supervisionCorrectionTest.pending.length === 1');
        await ui.setRoute('/inicio'); await wait('document.querySelectorAll("dialog[open]").length >= 1');
        assert.equal(await evaluate('location.pathname'), '/asistencias/gestion');
        await evaluate('supervisionCorrectionTest.pending.shift()()');
        await wait('location.pathname === "/inicio"');
        await ui.load(); assert.match(await evaluate(`${rows}[0].textContent`), /Presente/);
      });
      await t.test('expiración durante PATCH descarta respuesta y error antiguos al entrar con otra cuenta', async () => {
        for (const status of [null, 500]) {
          await ui.load(); await evaluate(`supervisionCorrectionTest.hold = true; supervisionCorrectionTest.status = ${JSON.stringify(status)}`);
          await ui.edit(); await ui.confirm(); await wait('supervisionCorrectionTest.pending.length === 1');
          await evaluate('authTest.meStatus = 401; authTest.verify()'); await wait('location.pathname === "/login"');
          await evaluate('authTest.meStatus = null'); await ui.signIn('SUBDIRECCION', 'PRIMARIA'); await ui.load();
          await evaluate('supervisionCorrectionTest.pending.shift()()');
          assert.match(await evaluate(`${rows}[0].textContent`), /Presente/);
          assert.doesNotMatch(await evaluate('document.body.textContent'), /Corrección guardada correctamente|resultado es incierto/);
        }
      });
      await t.test('GET de recuperación tardío no restaura datos tras cambio de cuenta', async () => {
        await ui.load(); await evaluate('supervisionCorrectionTest.status = 409'); await ui.edit(); await ui.confirm(); await error();
        await evaluate('supervisionCorrectionTest.holdRead = true'); await click('Consultar estado actual');
        await wait('supervisionCorrectionTest.readPending.length === 1');
        await evaluate('authTest.meStatus = 401; authTest.verify()'); await wait('location.pathname === "/login"');
        await evaluate('authTest.meStatus = null'); await ui.signIn(); await ui.load();
        await evaluate('supervisionCorrectionTest.readPending.shift()()');
        assert.equal(await evaluate('Boolean(document.querySelector("#main-content [role=alert]"))'), false);
        assert.equal(await evaluate(`${rows}.length`), 5);
      });
    } finally { await ui.close(); }
  });
