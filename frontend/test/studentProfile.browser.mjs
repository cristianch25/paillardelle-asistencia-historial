import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';
import { writeFile } from 'node:fs/promises';

for (const cargo of ['DOCENTE', 'AUXILIAR']) test(`Perfil compacto de ${cargo}: búsqueda, acceso y cierre sin escrituras`, { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
  const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
  const open = `document.querySelector('[aria-label="Coincidencias de mis estudiantes"] [role="button"]')`;
  const view = `${modal}?.querySelector('[aria-label="Datos del perfil individual"]')`;
  async function change(selector, value) {
    await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  try {
    await ui.navigate('/login'); await wait('Boolean(window.profileTest)'); await evaluate(`profileTest.cargo = ${JSON.stringify(cargo)}`); await ui.login();
    await ui.setRoute('/asistencias'); await wait('Boolean(document.querySelector("input[type=date]"))');
    await change('document.querySelector("input[type=date]")', '2026-11-13');
    await change('document.querySelector("input[type=search]")', 'Ana'); await wait(`Boolean(${open})`);
    await t.test('perfil compacto y X preservan búsqueda y fecha sin escribir asistencia', async () => {
      const patches = await evaluate('navigationTest.calls.filter(c => c.method === "patch").length');
      await evaluate(`${open}.click()`);
      await wait(`Boolean(${view})`);
      assert.match(await evaluate(`${modal}.textContent`), /Apoderada actual.*900000001/);
      assert.equal(await evaluate(`${modal}.querySelector('h2').textContent`), 'Perfil del estudiante');
      assert.equal(await evaluate(`${modal}.querySelectorAll('select, input, table').length`), 0);
      assert.doesNotMatch(await evaluate(`${modal}.textContent`), /Resumen mensual|Secciones del período|Historial diario|Código:|Actualizar perfil|Guardar número/);
      assert.equal(await evaluate(`${modal}.querySelector('button[aria-label="Editar celular"]').disabled`), false);
      await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`); await wait(`!${modal}`);
      assert.equal(await evaluate('document.querySelector("input[type=search]").value'), 'Ana');
      assert.equal(await evaluate('document.querySelector("input[type=date]").value'), '2026-11-13');
      assert.equal(await evaluate('navigationTest.calls.filter(c => c.method === "patch").length'), patches);
      assert.equal(await evaluate('location.pathname'), '/asistencias');
    });
    await t.test('320/390 px sin desplazamiento horizontal y con controles táctiles', async () => {
      await evaluate(`${open}.click()`); await wait(`Boolean(${view})`);
      for (const width of [320, 390]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate(`${modal}.getBoundingClientRect().width <= ${width} && document.documentElement.scrollWidth <= ${width} && ${modal}.scrollWidth <= ${modal}.clientWidth`));
        assert.ok(await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').getBoundingClientRect().height >= 44`));
      }
      await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`);
      await evaluate('profileTest.status = 404');
      await evaluate(`${open}.click()`);
      await wait(`Boolean(${modal}.querySelector('[role=alert]'))`);
      assert.equal(await evaluate(`Boolean(${view})`), false);
      await evaluate('profileTest.status = null; profileTest.contact = false'); await click('Reintentar perfil'); await wait(`Boolean(${view})`);
      assert.match(await evaluate(`${modal}.textContent`), /Contacto no disponible/);
      await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`);
    });
    await t.test('respuestas tardías tras cerrar no reabren el perfil ni alteran la búsqueda', async () => {
      await evaluate('profileTest.hold = true');
      await evaluate(`${open}.click()`);
      await wait('profileTest.pending.length > 0'); await evaluate(`${modal}.querySelector('button[aria-label="Cerrar perfil"]').click()`);
      await evaluate('profileTest.pending.splice(0).forEach(resolve => resolve())');
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      assert.equal(await evaluate(`Boolean(${modal})`), false); assert.equal(await evaluate('document.querySelector("input[type=search]").value'), 'Ana');
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
      assert.equal(await evaluate(`document.querySelector('[aria-label="Perfil individual del estudiante"]').querySelectorAll('select').length`), 0);
      assert.equal(await evaluate(`document.querySelector('[aria-label="Perfil individual del estudiante"]').querySelectorAll('input[type=month]').length`), 1);
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
    await wait(`Boolean(document.querySelector('[aria-label="Datos del perfil individual"]'))`);
    const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
    assert.equal(await evaluate(`${modal}.querySelectorAll('select').length`), 0);
    assert.doesNotMatch(await evaluate(`${modal}.textContent`), /Se muestran datos guardados|Al volver se conservan/);
    const before = await evaluate('profileTest.calls.at(-1).params.anio_escolar_id');
    await click('Actualizar perfil'); await wait(`Boolean(${modal}.querySelector('[aria-label="Datos del perfil individual"]'))`);
    assert.equal(await evaluate('profileTest.calls.at(-1).params.anio_escolar_id'), before);
    for (const width of [1280, 412, 320]) {
      await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 915, deviceScaleFactor: 1, mobile: width < 600 });
      assert.ok(await evaluate(`${modal}.scrollWidth <= ${modal}.clientWidth && document.documentElement.scrollWidth <= ${width}`));
      if (width === 412) {
        const shot = await ui.command('Page.captureScreenshot', { format: 'png' });
        await writeFile('node_modules/.tmp/student-profile-412.png', Buffer.from(shot.data, 'base64'));
      }
    }
    await click('Volver');
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
    await wait(`Boolean(document.querySelector('[aria-label="Datos del perfil individual"]'))`);
    const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
    assert.equal(await evaluate(`${modal}.querySelectorAll('select').length`), 0);
    assert.equal(await evaluate('profileTest.calls.at(-1).params.anio_escolar_id'), '1');
    await click('Actualizar perfil'); await wait(`Boolean(${modal}.querySelector('[aria-label="Datos del perfil individual"]'))`);
    assert.equal(await evaluate('profileTest.calls.at(-1).params.anio_escolar_id'), '1');
    await evaluate(`(() => { const e = ${modal}.querySelector('input[type=month]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '2026-10'); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await wait(`profileTest.calls.at(-1).params.mes === '2026-10' && Boolean(${modal}.querySelector('[aria-label="Datos del perfil individual"]'))`);
    assert.equal(await evaluate(`${modal}.querySelector('tbody th').textContent`), '31/10/2026');
    assert.doesNotMatch(await evaluate(`${modal}.querySelector('thead').textContent`), /Sección/);
    await evaluate('profileTest.sectionChange = true'); await click('Actualizar perfil');
    await wait(`${modal}.querySelector('thead')?.textContent.includes('Sección')`);
    assert.match(await evaluate(`${modal}.textContent`), /OTRA SECCIÓN/);
    assert.equal(await evaluate(`${modal}.querySelectorAll('tbody tr').length`), 31);
    await ui.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 915, deviceScaleFactor: 1, mobile: true });
    assert.ok(await evaluate(`${modal}.scrollWidth <= ${modal}.clientWidth && document.documentElement.scrollWidth <= 320`));
    await click('Volver');
    assert.equal(await evaluate('location.pathname'), '/secciones/estudiantes');
    assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Estudiantes de la fecha consultada"] li').length`), 4);
  } finally { await ui.close(); }
});
