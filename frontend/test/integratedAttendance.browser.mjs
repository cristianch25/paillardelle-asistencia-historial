import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('ADMIN Asistencias: tarjetas/búsqueda/perfil, filtros y guardado existente',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 120000 }, async t => {
    const ui = await authBrowser('integratedAttendanceHarness.jsx');
    const { evaluate, wait, click } = ui;
    const errors = [];
    ui.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description ?? event.exceptionDetails.text));
    await ui.command('Runtime.enable');
    const cards = `document.querySelector('[aria-label="Resultados de supervisión"]')`;
    const filter = `document.querySelector('[aria-label="Filtros de asistencias"]')`;
    const profile = `document.querySelector('[aria-label="Perfil del estudiante"]')`;
    const rows = `Array.from(document.querySelectorAll('[aria-label="Resultados de búsqueda de estudiantes"] > li'))`;
    const searchCalls = `supervisionCorrectionTest.calls.filter(c => c.url === '/asistencias/busqueda-estudiantes')`;
    const writes = `supervisionCorrectionTest.calls.filter(c => c.method === 'patch')`;
    const globalSearch = `document.querySelector('#main-content input[type=search]')`;
    async function change(selector, value) {
      await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event(e.tagName === 'INPUT' && !['date'].includes(e.type) ? 'input' : 'change', { bubbles: true })); })()`);
    }
    try {
      await ui.navigate('/login'); await ui.login(); await ui.setRoute('/asistencias/gestion');
      await wait(`location.pathname === '/asistencias/supervision' && Boolean(${filter})`);
      await change(`${filter}.querySelector('input[type=date]')`, '2026-11-15'); await wait(`Boolean(${cards})`);
      await t.test('URL compatible y menú único; vacío muestra tarjetas sin búsqueda global', async () => {
        assert.equal(await evaluate(`parseFloat(getComputedStyle(${globalSearch}).borderRadius) >= ${globalSearch}.getBoundingClientRect().height / 2`), true);
        assert.equal(await evaluate(`Boolean(${globalSearch}.parentElement.parentElement.querySelector('.lucide-search'))`), true);
        assert.equal(await evaluate(`${searchCalls}.length`), 0);
        const labels = await evaluate(`Array.from(document.querySelector('nav[aria-label="Navegación principal"]').querySelectorAll('a')).map(a => a.textContent)`);
        assert.equal(labels.filter(label => label === 'Asistencias').length, 1);
        assert.equal(labels.includes('Gestión de asistencias'), false);
        assert.equal(await evaluate(`${filter}.querySelectorAll('select').length`), 2);
      });
      await t.test('búsqueda sustituye tarjetas, sin resultados y limpieza conserva filtros', async () => {
        await change(`${filter}.querySelectorAll('select')[1]`, 'INICIAL'); await wait(`Boolean(${cards})`);
        const year = await evaluate(`${filter}.querySelector('select').value`);
        await evaluate("supervisionCorrectionTest.server.padron[0].estudiante.codigo_estudiante='PRUEBA-001'");
        await change(globalSearch, 'PRUEBA-001'); await wait(`${rows}.length === 1`);
        assert.match(await evaluate(`${rows}[0].textContent`), /PRUEBA-001/);
        assert.equal(await evaluate(`${searchCalls}.at(-1).params.q`), 'PRUEBA-001');
        await click('Limpiar búsqueda'); await wait(`Boolean(${cards})`);
        await change(globalSearch, 'Estudiante 1'); await wait(`${rows}.length === 1`);
        assert.equal(await evaluate(`Boolean(${cards})`), false);
        assert.deepEqual(Object.keys(await evaluate(`${searchCalls}.at(-1).params`)).sort(), ['fecha', 'limit', 'page', 'q']);
        await change(globalSearch, 'NO EXISTE'); await wait('document.body.textContent.includes("No se encontraron estudiantes")');
        await click('Limpiar búsqueda'); await wait(`Boolean(${cards})`);
        assert.equal(await evaluate(`${filter}.querySelector('select').value`), year);
        assert.equal(await evaluate(`${filter}.querySelectorAll('select')[1].value`), 'INICIAL');
        assert.equal(await evaluate(`${filter}.querySelector('input').value`), '2026-11-15');
      });
      await t.test('perfil de fecha real, marca y justificación conjunta; persistida protegida', async () => {
        await change(globalSearch, 'Estudiante 1'); await wait(`${rows}.length === 1`);
        await evaluate(`${rows}[0].querySelector('button').click()`); await wait(`Boolean(${profile})`);
        assert.match(await evaluate(`${profile}.textContent`), /Asistencia del 15\/11\/2026.*historial individual completo todavía no está disponible/);
        const before = await evaluate(`${writes}.length`);
        await evaluate(`Array.from(${profile}.querySelectorAll('button')).find(b => b.textContent === 'Tardanza').click()`);
        await evaluate(`${profile}.querySelector('input[type=checkbox]').click()`);
        await change(`${profile}.querySelector('input:not([type=checkbox])')`, 'Motivo autorizado');
        assert.equal(await evaluate(`${writes}.length`), before);
        await click('Volver a resultados'); await wait('Boolean(document.querySelector("dialog[open]"))');
        await click('Continuar registrando');
        assert.equal(await evaluate(`Boolean(${profile})`), true);
        assert.equal(await evaluate(`${writes}.length`), before);
        await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        const body = await evaluate(`${writes}.at(-1).body`);
        assert.equal(body.cambios.length, 1); assert.equal(body.cambios[0].estado, 'TARDANZA');
        assert.equal(body.cambios[0].justificada, true); assert.equal(body.cambios[0].motivo_justificacion, 'Motivo autorizado');
        assert.ok(await evaluate(`${profile}.querySelector('input[type=checkbox]').disabled`));
        await click('Volver a resultados'); await wait(`${rows}.length === 1`);
        await click('Limpiar búsqueda'); await wait(`Boolean(${cards})`);
      });
      await t.test('detalle de sección conserva navegación, consulta y corrección de registros existentes', async () => {
        await evaluate(`${cards}.querySelector('a').click()`);
        await wait(`Boolean(document.querySelector('[aria-label="Edición autorizada de asistencia"]'))`);
        assert.match(await evaluate('document.body.textContent'), /Inicial.*CREATIVOS/);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Asistencias · Detalle|Registro de asistencia/);
        assert.doesNotMatch(await evaluate('document.querySelector("#main-content").textContent'), /Se aplica a los estudiantes sin marcar|No hay estudiantes sin marcar/);
        const totals = `document.querySelector('[aria-label="Totales de asistencia"]')`;
        assert.deepEqual(await evaluate(`Array.from(${totals}.querySelectorAll('dd')).map(e => Number(e.textContent))`), [5, 1, 2, 1, 1]);
        for (const width of [1280, 412, 320]) {
          await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
          assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
          assert.equal(await evaluate(`getComputedStyle(${totals}).gridTemplateColumns.split(' ').length`), width >= 768 ? 4 : 2);
          assert.equal(await evaluate(`parseFloat(getComputedStyle(${globalSearch}).borderRadius) >= ${globalSearch}.getBoundingClientRect().height / 2`), true);
        }
        await ui.command('Emulation.setFocusEmulationEnabled', { enabled: true });
        await evaluate(`${globalSearch}.focus()`);
        assert.equal(await evaluate(`${globalSearch}.labels[0].textContent`), 'Buscar estudiante');
        await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Marcar todos como presentes');
        await ui.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
        await ui.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
        assert.equal(await evaluate(`document.activeElement === ${globalSearch} && ${globalSearch}.matches(':focus-visible')`), true);
        assert.equal(await evaluate(`getComputedStyle(${globalSearch}).outlineStyle`), 'solid');
        await change(globalSearch, 'Estudiante 2');
        await wait(`document.querySelectorAll('[aria-label="Sesión de asistencia"] ul > li').length === 1`);
        assert.match(await evaluate('document.body.textContent'), /Mostrando 1 de 5 estudiantes/);
        await change(globalSearch, 'NO EXISTE');
        await wait('document.body.textContent.includes("No hay estudiantes que coincidan con la búsqueda")');
        await evaluate('window.bulkConfirmations=[]; window.confirm = message => { bulkConfirmations.push(message); return false; }'); await click('Marcar todos como presentes');
        assert.match(await evaluate('bulkConfirmations.at(-1)'), /También incluye a los estudiantes ocultos por la búsqueda.*Las demás marcas se conservarán/);
        assert.equal(await evaluate('document.body.textContent.includes("0 cambios sin guardar")'), true);
        await evaluate('window.confirm = () => true'); await click('Marcar todos como presentes');
        await wait('document.body.textContent.includes("1 cambio sin guardar")');
        await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        assert.equal(await evaluate(`${writes}.at(-1).body.cambios[0].estado`), 'PRESENTE');
        assert.equal(await evaluate('supervisionCorrectionTest.server.resumen.pendientes'), 0);
        assert.equal(await evaluate(`${ui.button('Marcar todos como presentes')}.disabled`), true);
        await change(globalSearch, '');
        await wait(`document.querySelectorAll('[aria-label="Sesión de asistencia"] ul > li').length === 5`);
        await evaluate(`document.querySelectorAll('[aria-label="Sesión de asistencia"] ul > li')[1].querySelector('button').click()`);
        await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        assert.equal(await evaluate(`${writes}.at(-1).body.cambios.length`), 1);
        await evaluate(`document.querySelector('a[href="/asistencias/supervision"]').click()`); await wait(`Boolean(${cards})`);
        assert.equal(await evaluate(`${filter}.querySelector('input').value`), '2026-11-15');
      });
      await t.test('datos ausentes y respuestas antiguas no inventan perfil ni asistencia', async () => {
        await evaluate('supervisionCorrectionTest.missing = true');
        await change(globalSearch, 'Estudiante 2'); await wait(`${rows}.length === 1`);
        await evaluate(`${rows}[0].querySelector('button').click()`); await wait(`Boolean(${profile})`);
        assert.match(await evaluate(`${profile}.textContent`), /No hay una asistencia existente/);
        assert.equal(await evaluate(`Boolean(${profile}.querySelector('[aria-label="Guardado de asistencia"]'))`), false);
        await click('Volver a resultados'); await wait(`${rows}.length === 1`);
        await evaluate('supervisionCorrectionTest.missing = false; supervisionCorrectionTest.searchHold = true');
        await change(globalSearch, 'Estudiante 1'); await wait('supervisionCorrectionTest.searchPending.length === 1');
        await evaluate('supervisionCorrectionTest.searchHold = false'); await change(globalSearch, 'Estudiante 3'); await wait(`${rows}.length === 1`);
        await evaluate('supervisionCorrectionTest.searchPending.shift()()');
        assert.match(await evaluate(`${rows}[0].textContent`), /Estudiante 3/);
      });
      for (const level of ['PRIMARIA', 'SECUNDARIA']) await t.test(`ADMIN corrige ${level} en asistencia cerrada sin reabrir`, async () => {
        await evaluate(`supervisionCorrectionTest.level = ${JSON.stringify(level)}; supervisionCorrectionTest.reset('CERRADA')`);
        await click('Limpiar búsqueda'); await wait(`Boolean(${cards})`);
        await change(globalSearch, 'Estudiante 2'); await wait(`${rows}.length === 1`);
        await evaluate(`${rows}[0].querySelector('button').click()`); await wait(`Boolean(${profile})`);
        await evaluate(`Array.from(${profile}.querySelectorAll('button')).find(b => b.textContent === 'Falta').click()`);
        await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
        assert.equal(await evaluate(`${writes}.at(-1).body.cambios.length`), 1);
        assert.equal(await evaluate(`${writes}.at(-1).body.cambios[0].motivo`), undefined);
        assert.equal(await evaluate('supervisionCorrectionTest.server.sesion.estado'), 'CERRADA');
        await click('Volver a resultados'); await wait(`${rows}.length === 1`);
      });
      assert.equal(await evaluate('supervisionCorrectionTest.calls.some(c => ["post", "delete", "put"].includes(c.method))'), false);
    } catch (error) { throw new Error(`${error.message}\n${errors.join('\n')}`, { cause: error }); }
    finally { await ui.close(); }
  });
