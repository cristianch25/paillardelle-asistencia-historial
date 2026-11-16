import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supervisionCorrectionBrowser } from './support/supervisionCorrectionBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';
import { sessionId } from './support/supervisionDetailFixture.mjs';

test('7B.1D: fecha, ausencias reales, permisos y aislamiento de búsqueda global',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 150000 }, async t => {
    const ui = await supervisionCorrectionBrowser();
    const { evaluate, wait, click, action, rows } = ui;
    const calls = `supervisionCorrectionTest.calls.filter(c => c.url === '/asistencias/busqueda-estudiantes')`;
    const search = 'document.querySelector("input[type=search]")';
    const date = 'document.querySelector("input[type=date]")';
    const disabled = `Array.from(${action}.querySelectorAll('button')).find(b => b.textContent === 'Actualizar asistencia').disabled`;
    try {
      await ui.navigate('/asistencias/gestion'); await wait('location.pathname === "/login"');
      await ui.signIn(); await ui.setRoute('/asistencias/gestion'); await wait(`Boolean(${action})`);
      await t.test('fecha inicial de Lima, un único selector y búsqueda sin año/nivel/sección', async () => {
        assert.equal(await evaluate(`${date}.value`), await evaluate(`new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())`));
        assert.equal(await evaluate('document.querySelectorAll("input[type=date]").length'), 1);
        assert.equal(await evaluate('document.querySelectorAll("#main-content select").length'), 0);
        assert.deepEqual(await evaluate(`Object.keys(${calls}[0].params).sort()`), ['fecha', 'limit', 'page', 'q']);
        assert.equal(await evaluate('supervisionCorrectionTest.calls.some(c => c.url === "/asistencias/sesiones" || c.url === "/anios-escolares")'), false);
      });
      await t.test('SIN_ASISTENCIA y SIN_SESION son seleccionables pero no actualizables, sin convertirlas en faltas', async () => {
        await ui.load();
        await evaluate(`(() => { const first = supervisionCorrectionTest.results()[0];
          supervisionCorrectionTest.extraRows = [
            { ...first, matricula_id: '100', matricula_seccion_id: '101', situacion: 'SIN_ASISTENCIA', estado: null, asistencia_id: null, asistencia_version: null },
            { ...first, matricula_id: '102', matricula_seccion_id: '103', situacion: 'SIN_SESION', estado: null, asistencia_id: null,
              asistencia_version: null, sesion_id: null, sesion_estado: null, sesion_version: null } ]; })()`);
        await ui.refresh(); await wait(`${rows}.length === 7`);
        for (const [index, label] of [[5, 'Sin asistencia'], [6, 'Sin sesión']]) {
          assert.ok((await evaluate(`${rows}[${index}].textContent`)).includes(label));
          await evaluate(`${rows}[${index}].querySelector('button').click()`);
          assert.ok(await evaluate(disabled));
          assert.match(await evaluate(`${rows}[${index}].textContent`), /No hay una asistencia existente/);
        }
        assert.equal(await evaluate('supervisionCorrectionTest.calls.filter(c => c.method !== "get").length'), 0);
      });
      await t.test('PENDIENTE real se actualiza con versión cero sin crear una sesión', async () => {
        await ui.load(); await ui.change(search, 'Estudiante 4'); await wait(`Boolean(${action}) && ${rows}.length === 1`);
        assert.match(await evaluate(`${rows}[0].textContent`), /Pendiente/);
        await evaluate(`${rows}[0].querySelector('button').click()`); assert.equal(await evaluate(disabled), false);
        await click('Actualizar asistencia'); await wait('Boolean(document.querySelector("dialog[open] select"))');
        await ui.change('document.querySelector("dialog[open] select")', 'PRESENTE'); await ui.confirm(); await ui.saved();
        assert.equal(await evaluate('supervisionCorrectionTest.calls.filter(c => c.method === "patch").at(-1).body.cambios[0].version'), 0);
        assert.match(await evaluate(`${rows}[0].textContent`), /Presente/);
      });
      await t.test('versiones cambiadas antes de abrir requieren actualizar resultados, sin adoptar otra versión silenciosamente', async () => {
        await ui.load(); await evaluate(`${rows}[0].querySelector('button').click()`);
        await evaluate('supervisionCorrectionTest.server.sesion.version++'); await click('Actualizar asistencia');
        await wait('Boolean(document.querySelector("#main-content [role=alert]"))');
        assert.match(await evaluate('document.body.textContent'), /Los datos cambiaron/);
        assert.equal(await evaluate('Boolean(document.querySelector("dialog[open]"))'), false);
        await click('Actualizar resultados'); await wait(`Boolean(${action})`);
      });
      await t.test('cambiar fecha descarta selección y respuestas antiguas, incluido un error tardío', async () => {
        for (const status of [null, 500]) {
          await ui.load(); await evaluate(`${rows}[0].querySelector('button').click()`);
          await evaluate(`supervisionCorrectionTest.searchHold = true; supervisionCorrectionTest.searchStatus = ${status}`);
          await ui.change(date, '2026-11-14'); await wait('supervisionCorrectionTest.searchPending.length === 1');
          assert.equal(await evaluate(`Boolean(${action})`), false);
          await evaluate('supervisionCorrectionTest.searchHold = false; supervisionCorrectionTest.searchStatus = null');
          await ui.change(date, '2026-11-13'); await wait(`Boolean(${action})`);
          await evaluate('supervisionCorrectionTest.searchPending.shift()()'); assert.ok(await evaluate(disabled));
          assert.equal(await evaluate(`${date}.value`), '2026-11-13');
          assert.equal(await evaluate('Boolean(document.querySelector("#main-content [role=alert]"))'), false);
        }
      });
      await t.test('errores de búsqueda y parámetros largos permiten corregir y reintentar sin mostrar listas previas', async () => {
        for (const status of [400, 403, 409, 500, 'network']) {
          await ui.load(); await evaluate(`supervisionCorrectionTest.searchStatus = ${JSON.stringify(status)}`);
          await ui.change(search, 'Prueba'); await wait('Boolean(document.querySelector("#main-content [role=alert]"))');
          assert.equal(await evaluate(`${rows}.length`), 0);
          await evaluate('supervisionCorrectionTest.searchStatus = null'); await click('Reintentar búsqueda');
          await wait(`Boolean(${action})`); assert.match(await evaluate(`${action}.textContent`), /No se encontraron estudiantes/);
        }
        await ui.change(search, 'x'.repeat(121)); await wait('document.body.textContent.includes("120 caracteres")');
      });
      await t.test('Supervisión conserva consulta; REGISTRADOR no recibe menú ni acceso a Gestión', async () => {
        await ui.setRoute(`/asistencias/supervision/${sessionId}`); await wait('Boolean(document.querySelector(\'[aria-label="Sesión consultada"]\'))');
        assert.equal(await evaluate(`Boolean(${action})`), false);
        assert.ok(await evaluate('Boolean(document.querySelector(\'[aria-label="Totales de asistencia"]\'))'));
        await ui.signIn('REGISTRADOR', 'INICIAL'); const before = await evaluate(`${calls}.length`);
        assert.equal(await evaluate('Array.from(document.querySelectorAll("a")).some(a => a.textContent === "Gestión de asistencias")'), false);
        await ui.setRoute('/asistencias/gestion'); await wait('location.pathname === "/inicio"');
        assert.equal(await evaluate(`${calls}.length`), before);
      });
    } finally { await ui.close(); }
  });
