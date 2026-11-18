import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const cargo of ['DOCENTE', 'AUXILIAR']) test(`Perfil compacto de ${cargo}: borrador, acceso y cierre sin escrituras`, { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
  const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
  const rows = `document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li')`;
  const view = `${modal}?.querySelector('[aria-label="Datos del perfil individual"]')`;
  async function change(selector, value) {
    await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  try {
    await ui.navigate('/login'); await wait('Boolean(window.profileTest)'); await evaluate(`profileTest.cargo = ${JSON.stringify(cargo)}`); await ui.login();
    await ui.setRoute('/secciones'); await wait(`Boolean(document.querySelector('button[aria-label^="Asistencia diaria de 4"]'))`);
    await evaluate(`document.querySelector('button[aria-label^="Asistencia diaria de 4"]').click()`);
    await change('document.querySelector("input[type=date]")', '2026-11-13'); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
    await t.test('perfil compacto y X preservan cambios sin guardar, fecha y salón', async () => {
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent.trim() === 'Tardanza').click()`);
      await wait(`${rows}[0].textContent.includes('Sin guardar')`);
      const patches = await evaluate('navigationTest.calls.filter(c => c.method === "patch").length');
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Ver perfil').click()`);
      await wait(`Boolean(${view})`);
      assert.match(await evaluate(`${modal}.textContent`), /Apoderada actual.*900000001/);
      assert.equal(await evaluate(`${modal}.querySelector('h2').textContent`), 'Perfil del estudiante');
      assert.equal(await evaluate(`${modal}.querySelectorAll('select, input, table').length`), 0);
      assert.doesNotMatch(await evaluate(`${modal}.textContent`), /Resumen mensual|Secciones del período|Historial diario|Código:|Actualizar perfil|Guardar número/);
      assert.equal(await evaluate(`${modal}.querySelector('button[aria-label="Editar celular"]').disabled`), false);
      await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`); await wait(`!${modal}`);
      assert.match(await evaluate(`${rows}[0].textContent`), /Sin guardar/);
      assert.equal(await evaluate(`${rows}[0].querySelector('[aria-pressed=true]').textContent`), 'Tardanza');
      assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), patches);
      assert.equal(await evaluate('location.pathname'), '/secciones/asistencia');
    });
    await t.test('320/390 px sin desplazamiento horizontal y con controles táctiles', async () => {
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Ver perfil').click()`); await wait(`Boolean(${view})`);
      for (const width of [320, 390]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate(`${modal}.getBoundingClientRect().width <= ${width} && document.documentElement.scrollWidth <= ${width} && ${modal}.scrollWidth <= ${modal}.clientWidth`));
        assert.ok(await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').getBoundingClientRect().height >= 44`));
      }
      await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`);
      await evaluate('profileTest.status = 404');
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Ver perfil').click()`);
      await wait(`Boolean(${modal}.querySelector('[role=alert]'))`);
      assert.equal(await evaluate(`Boolean(${view})`), false);
      await evaluate('profileTest.status = null; profileTest.contact = false'); await click('Reintentar perfil'); await wait(`Boolean(${view})`);
      assert.match(await evaluate(`${modal}.textContent`), /Contacto no disponible/);
      await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`);
    });
    await t.test('respuestas tardías tras Volver no reabren el perfil ni alteran el borrador', async () => {
      await evaluate('profileTest.hold = true');
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Ver perfil').click()`);
      await wait('profileTest.pending.length > 0'); await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`);
      await evaluate('profileTest.pending.splice(0).forEach(resolve => resolve())');
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.equal(await evaluate(`Boolean(${modal})`), false); assert.match(await evaluate(`${rows}[0].textContent`), /Sin guardar/);
      assert.equal(await evaluate('profileTest.calls.every(c => c.method === "get")'), true);
    });
  } finally { await ui.close(); }
});

test('ADMIN/SUBDIRECCION: perfil desde seguimiento sin perder mes/nivel ni crear menú nuevo', { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
  try {
    await ui.navigate('/login?source=stats'); await wait('Boolean(window.profileTest)');
    for (const role of ['ADMIN', 'SUBDIRECCION']) {
      await evaluate(`statisticsTest.role = ${JSON.stringify(role)}`); await ui.login(); await ui.setRoute('/estadisticas');
      await wait(`Boolean(document.querySelector('[aria-label="Seguimiento mensual"] table'))`);
      const before = await evaluate(`document.querySelector('[aria-label="Seguimiento mensual"] input').value`);
      await evaluate(`document.querySelector('[aria-label="Seguimiento mensual"] tbody button').click()`);
      await wait(`Boolean(document.querySelector('[aria-label="Datos del perfil individual"]'))`);
      assert.equal(await evaluate(`document.querySelector('[aria-label="Perfil individual del estudiante"]').querySelectorAll('select, input[type=month], table').length`), 3);
      assert.match(await evaluate(`document.querySelector('[aria-label="Datos del perfil individual"]').textContent`), /Resumen mensual.*Historial diario/);
      await click('Volver');
      assert.equal(await evaluate(`document.querySelector('[aria-label="Seguimiento mensual"] input').value`), before);
      await click('Cerrar sesión'); await wait('location.pathname === "/login"');
    }
  } finally { await ui.close(); }
});

test('ADMIN: búsqueda de Asistencias conserva texto y fecha al volver del perfil de solo lectura', { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
  try {
    await ui.navigate('/login?source=search'); await wait('Boolean(window.profileTest)'); await ui.login(); await ui.setRoute('/asistencias/supervision');
    await wait(`Boolean(document.querySelector('[aria-label="Filtros de asistencias"]'))`);
    await evaluate(`(() => { const e = document.querySelector('[aria-label="Filtros de asistencias"] input[type=date]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '2026-11-15'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await evaluate(`(() => { const e = document.querySelector('#main-content input[type=search]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, 'Estudiante 1'); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await wait(`Boolean(document.querySelector('[aria-label="Resultados de búsqueda de estudiantes"] > li button'))`);
    await evaluate(`document.querySelector('[aria-label="Resultados de búsqueda de estudiantes"] > li button').click()`);
    await wait(`Boolean(document.querySelector('[aria-label="Perfil del estudiante"]'))`); await click('Ver perfil');
    await wait(`Boolean(document.querySelector('[aria-label="Datos del perfil individual"]'))`); await click('Volver');
    assert.equal(await evaluate(`document.querySelector('#main-content input[type=search]').value`), 'Estudiante 1');
    assert.equal(await evaluate('profileTest.calls.at(-1).params.mes'), '2026-11');
    assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Perfil del estudiante"]'))`), true);
  } finally { await ui.close(); }
});

test('SUBDIRECCION: acceso desde estudiantes de una sección autorizada sin perder el padrón', { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
  try {
    await ui.navigate('/login'); await wait('Boolean(window.profileTest)'); await evaluate('profileTest.role = "SUBDIRECCION"');
    await ui.login(); await ui.setRoute('/secciones');
    await wait(`Boolean(document.querySelector('ul[aria-label="Secciones disponibles"] button'))`);
    await evaluate(`Array.from(document.querySelectorAll('ul[aria-label="Secciones disponibles"] button')).find(b => b.textContent.toLowerCase().includes('estudiantes')).click()`);
    await wait(`Boolean(document.querySelector('[aria-label="Estudiantes de la fecha consultada"] button'))`);
    await evaluate(`document.querySelector('[aria-label="Estudiantes de la fecha consultada"] button').click()`);
    await wait(`Boolean(document.querySelector('[aria-label="Datos del perfil individual"]'))`); await click('Volver');
    assert.equal(await evaluate('location.pathname'), '/secciones/estudiantes');
    assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Estudiantes de la fecha consultada"] li').length`), 4);
  } finally { await ui.close(); }
});
