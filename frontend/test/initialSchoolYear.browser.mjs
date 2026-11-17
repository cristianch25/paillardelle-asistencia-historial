import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge, edgePath } from './support/edgeBrowser.mjs';

test('selección inicial compartida: pantallas, opciones válidas, selección manual y cuentas',
  { skip: !hasEdge && `Configurar EDGE_PATH (${edgePath})`, timeout: 120000 }, async t => {
    const ui = await authBrowser('schoolYearSelectionHarness.jsx');
    const { evaluate, wait, click } = ui;
    const home = `document.querySelector('[aria-label="Filtros del resumen diario"] select')`;
    const supervision = `document.querySelector('[aria-label="Filtros de supervisión"] select')`;
    const sections = `document.querySelector('[aria-label="Búsqueda de secciones"] select')`;
    const assignments = `document.querySelector('form[aria-label="Nueva asignación"] select')`;
    const homeResult = `Boolean(document.querySelector('[aria-label="Resumen diario institucional"]'))`;
    const supervisionResult = `Boolean(document.querySelector('[aria-label="Resultados de supervisión"]'))`;
    const sectionResult = `Boolean(document.querySelector('[aria-label="Resultados de secciones"]'))`;
    const usersResult = `Boolean(document.querySelector('[aria-label="Usuarios encontrados"]'))`;
    async function change(selector, value) {
      await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    async function signIn(account = '9007199254740993', role = 'ADMIN') {
      if (await evaluate('Boolean(document.querySelector("#main-content"))')) { await click('Cerrar sesión'); await wait('location.pathname === "/login"'); }
      await evaluate(`yearTest.account = ${JSON.stringify(account)}; yearTest.role = ${JSON.stringify(role)}`);
      await ui.login();
    }
    try {
      await ui.navigate('/login'); await signIn();
      await t.test('Inicio selecciona el año actual cerrado; consulta y recarga no cambian el año manual', async () => {
        await wait(`${home}?.value === '26'`); await wait(homeResult);
        await change(home, '25'); await change(`document.querySelector('[aria-label="Filtros del resumen diario"] input')`, '2025-11-17');
        await wait(homeResult);
        await click('Actualizar resumen'); await wait(homeResult);
        assert.equal(await evaluate(`${home}.value`), '25');
      });
      await t.test('Supervisión conserva año manual, incluso vacío, al actualizar', async () => {
        await ui.setRoute('/asistencias/supervision'); await wait(`${supervision}?.value === '26'`);
        await change(supervision, '25'); await change(`document.querySelector('[aria-label="Filtros de supervisión"] input')`, '2025-11-17');
        await wait(supervisionResult);
        await click('Actualizar consulta'); assert.equal(await evaluate(`${supervision}.value`), '25');
        await change(supervision, ''); await change(`document.querySelector('[aria-label="Filtros de supervisión"] input')`, '2026-11-17');
        assert.equal(await evaluate(`${supervision}.value`), '');
      });
      await t.test('Secciones: valor inicial, URL explícita e ID inexistente sin peticiones inválidas', async () => {
        await ui.setRoute('/secciones'); await wait(`${sections}?.value === '26'`);
        await change(sections, '24'); await wait(sectionResult);
        await click('Actualizar secciones'); assert.equal(await evaluate(`${sections}.value`), '24');
        await ui.setRoute('/inicio'); await wait(`Boolean(${home})`);
        await ui.setRoute('/secciones?anio_escolar_id=25'); await wait(`${sections}?.value === '25'`);
        const before = await evaluate('yearTest.calls.length');
        await ui.setRoute('/secciones?anio_escolar_id=999'); await wait('document.body.textContent.includes("ya no está disponible")');
        assert.equal(await evaluate('yearTest.calls.slice(' + before + ').some(c => c.params?.anio_escolar_id === "999")'), false);
      });
      await t.test('asignaciones excluyen CERRADO y usan el ABIERTO más reciente; selección manual preservada', async () => {
        await ui.setRoute('/usuarios'); await wait(usersResult);
        await click('Asignaciones'); await wait(`${assignments}?.value === '25'`);
        assert.deepEqual(await evaluate(`Array.from(${assignments}.options).map(o => o.value)`), ['', '24', '25', '27']);
        await change(assignments, '27');
        await change(`document.querySelector('form[aria-label="Nueva asignación"] input[type="date"]')`, '2027-03-01');
        assert.equal(await evaluate(`${assignments}.value`), '27');
        await change(`document.querySelector('form[aria-label="Nueva asignación"] input[type="date"]')`, '');
        await click('Volver al listado');
      });
      await t.test('nueva cuenta usa su propio valor inicial; sin actual prioriza ABIERTO y sin candidatos deja vacío', async () => {
        await signIn('7'); await wait(`${home}?.value === '26'`);
        await evaluate('yearTest.years = yearTest.years.filter(y => y.id !== "26")');
        await signIn('8', 'SUBDIRECCION'); await ui.setRoute('/asistencias/supervision'); await wait(`${supervision}?.value === '25'`);
        await change(supervision, '24');
        await evaluate('yearTest.years = yearTest.years.filter(y => y.estado !== "ABIERTO")');
        await signIn('9', 'SUBDIRECCION'); await ui.setRoute('/asistencias/supervision');
        await wait(`${supervision}?.options.length === 2`); assert.equal(await evaluate(`${supervision}.value`), '');
      });
      assert.equal(await evaluate('yearTest.calls.every(c => c.method === "get")'), true);
    } finally { await ui.close(); }
  });
