import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const [principal, levels, consulted] of [['PRIMARIA', ['INICIAL', 'PRIMARIA'], 'INICIAL'],
  ['SECUNDARIA', ['SECUNDARIA'], 'SECUNDARIA'], ['INICIAL', ['INICIAL'], 'INICIAL']]) {
  test(`SUBDIRECCION ${principal}: Asistencias unificadas, perfil, contexto y corrección autorizada`, { skip: !hasEdge, timeout: 120000 }, async () => {
    const ui = await authBrowser('integratedAttendanceHarness.jsx'), { evaluate, wait, click } = ui;
    const filters = `document.querySelector('[aria-label="Filtros de asistencias"]')`;
    const search = `document.querySelector('#main-content input[type=search]')`;
    const profile = `document.querySelector('section[aria-label="Perfil del estudiante"]')`;
    const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
    const cards = `document.querySelector('[aria-label="Secciones de supervisión"]')`;
    const results = `document.querySelector('[aria-label="Resultados de búsqueda de estudiantes"]')`;
    async function change(selector, value) {
      await evaluate(`(() => { const e=${selector}; Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e.type==='search'?'input':'change',{bubbles:true})); })()`);
    }
    try {
      await ui.navigate('/login'); await wait('Boolean(window.supervisionCorrectionTest)');
      await evaluate(`supervisionTest.role='SUBDIRECCION'; supervisionTest.level='${principal}'; supervisionCorrectionTest.level='${consulted}'`);
      await ui.login(); await ui.setRoute('/asistencias/gestion');
      await wait(`location.pathname === '/asistencias/supervision' && Boolean(${filters})`);
      await change(`${filters}.querySelector('input[type=date]')`, '2026-11-15');
      await wait(`Boolean(${cards})`);
      const labels = await evaluate(`Array.from(document.querySelector('nav[aria-label="Navegación principal"]').querySelectorAll('a')).map(e=>e.textContent)`);
      assert.equal(labels.filter(label => label === 'Asistencias').length, 1);
      assert.equal(labels.some(label => /Gestión de asistencias|Supervisión de asistencias/.test(label)), false);
      assert.deepEqual(await evaluate(`Array.from(${filters}.querySelectorAll('select')[1].options).map(e=>e.value).filter(Boolean)`), levels);
      await change(`${filters}.querySelectorAll('select')[1]`, consulted);
      const year = await evaluate(`${filters}.querySelector('select').value`);
      await change(search, 'Estudiante 1'); await wait(`${results}?.children.length === 1`);
      await evaluate(`${results}.querySelector('li button').click()`);
      await wait(`Boolean(${profile}) && Boolean(${profile}.querySelector('button'))`);
      await evaluate(`Array.from(${profile}.querySelectorAll('button')).find(e=>e.textContent==='Falta').click()`);
      await click('Ver perfil'); await wait(`Boolean(${modal}) && ${modal}.textContent.includes('Historial diario')`);
      await evaluate(`Array.from(${modal}.querySelectorAll('button')).find(e=>e.textContent==='Volver').click()`);
      await wait(`!${modal}`);
      assert.equal(await evaluate(`${search}.value`), 'Estudiante 1');
      assert.equal(await evaluate(`${filters}.querySelector('select').value`), year);
      assert.equal(await evaluate(`${filters}.querySelectorAll('select')[1].value`), consulted);
      assert.equal(await evaluate(`${filters}.querySelector('input[type=date]').value`), '2026-11-15');
      assert.equal(await evaluate('supervisionCorrectionTest.calls.filter(e=>e.method==="patch").length'), 0);
      await click('Guardar cambios'); await wait('document.body.textContent.includes("Cambios guardados correctamente")');
      assert.equal(await evaluate('supervisionCorrectionTest.calls.filter(e=>e.method==="patch").at(-1).body.cambios[0].estado'), 'FALTA');
      await click('Volver a resultados'); await wait(`Boolean(${results})`);
      await click('Limpiar búsqueda'); await wait(`Boolean(${cards})`);
      await evaluate(`${cards}.querySelector('a').click()`);
      await wait(`Boolean(document.querySelector('[aria-label="Edición autorizada de asistencia"]'))`);
      assert.equal(await evaluate('document.body.textContent.includes("Volver a Asistencias")'), true);
      for (const width of [1280, 320, 390]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
      }
      assert.equal(await evaluate('supervisionCorrectionTest.calls.some(e=>["post","put","delete"].includes(e.method))'), false);
    } finally { await ui.close(); }
  });
}
