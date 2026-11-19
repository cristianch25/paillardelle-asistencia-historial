import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('Celular: edición, vista previa, confirmación, no-op, conflicto y borrador intacto en móvil', { skip: !hasEdge, timeout: 120000 }, async t => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
  const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
  const editor = `${modal}.querySelector('[aria-label="Celular del apoderado"]')`;
  const rows = `document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li')`;
  const patchCount = `profileTest.calls.filter(c => c.method === 'patch').length`;
  const close = () => evaluate(`${modal}.querySelector('[aria-label="Cerrar perfil"]').click()`);
  async function input(value) {
    await evaluate(`(() => { const e = ${editor}.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  async function edit(value) {
    await evaluate(`${editor}.querySelector('[aria-label="Editar celular"]').click()`); await input(value);
  }
  try {
    await ui.navigate('/login'); await wait('Boolean(window.profileTest)'); await ui.login(); await ui.setRoute('/asistencias');
    await wait(`Boolean(document.querySelector('button[aria-label^="Asistencia diaria de 4"]'))`);
    await evaluate(`document.querySelector('button[aria-label^="Asistencia diaria de 4"]').click()`);
    await evaluate(`(() => { const e = document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '2026-11-13'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await wait(`${rows}.length === 4`);
    await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Tardanza').click()`);
    await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Ver perfil').click()`); await wait(`Boolean(${editor})`);
    await t.test('Cancelar e inválidos no escriben; prefijo se normaliza en vista previa compartida', async () => {
      await edit('800000002'); await click('Guardar número'); await wait(`${editor}.textContent.includes('nueve dígitos')`);
      assert.equal(await evaluate('profileTest.phone.writes'), 0);
      await click('Cancelar'); await edit('+51 900 000 002'); await click('Guardar número');
      await wait(`Boolean(${editor}.querySelector('[aria-label="Confirmar cambio de celular"]'))`);
      assert.match(await evaluate(`${editor}.textContent`), /900000002.*contacto está compartido/);
      assert.equal(await evaluate(patchCount), 0); assert.equal(await evaluate('profileTest.phone.value'), '900000001');
    });
    await t.test('confirmación única, X bloqueada durante PATCH y éxito solo después de respuesta', async () => {
      await evaluate('profileTest.phone.hold = true'); await click('Confirmar cambio'); await wait('profileTest.phone.pending.length === 1');
      assert.equal(await evaluate(`${modal}.querySelector('[aria-label="Cerrar perfil"]').disabled`), true);
      assert.equal(await evaluate(patchCount), 1); assert.doesNotMatch(await evaluate(`${editor}.textContent`), /Número actualizado/);
      await evaluate('profileTest.phone.hold = false; profileTest.phone.pending.shift()()');
      await wait(`${editor}.textContent.includes('Número actualizado')`);
      assert.equal(await evaluate('profileTest.phone.value'), '900000002'); assert.match(await evaluate(`${editor}.textContent`), /900000002/);
    });
    await t.test('vacío/null, no-op y formularios a 320/390 px sin desbordar', async () => {
      await edit('900000002'); await click('Guardar número'); await wait(`${editor}.textContent.includes('No hay cambios')`);
      assert.equal(await evaluate(patchCount), 1);
      await edit('');
      for (const width of [320, 390]) {
        await ui.command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: true });
        assert.ok(await evaluate(`${modal}.scrollWidth <= ${modal}.clientWidth && document.documentElement.scrollWidth <= ${width}`));
      }
      await click('Guardar número'); await wait(`${editor}.textContent.includes('Nuevo número: Sin celular registrado')`);
      await click('Confirmar cambio'); await wait(`${editor}.textContent.includes('Número actualizado')`); assert.equal(await evaluate('profileTest.phone.value'), null);
    });
    await t.test('409 no reintenta ni anuncia éxito; consultar permite nueva edición', async () => {
      await edit('900000003'); await click('Guardar número'); await wait(`${editor}.textContent.includes('Confirmas el cambio')`);
      await evaluate('profileTest.phone.confirmStatus = 409'); await click('Confirmar cambio'); await wait(`${editor}.textContent.includes('No se pudo confirmar')`);
      const count = await evaluate(patchCount); assert.equal(await evaluate('profileTest.phone.value'), null);
      assert.equal(await evaluate(`Boolean(${editor}.querySelector('input'))`), false);
      await evaluate('profileTest.phone.confirmStatus = null'); await click('Consultar número actual'); await wait(`Boolean(${editor}.querySelector('[aria-label="Editar celular"]'))`);
      assert.equal(await evaluate(patchCount), count); await close(); await wait(`!${modal}`);
      assert.match(await evaluate(`${rows}[0].textContent`), /Sin guardar/);
      assert.equal(await evaluate(`${rows}[0].querySelector('[aria-pressed=true]').textContent`), 'Tardanza');
      assert.equal(await evaluate('navigationTest.calls.some(c => c.method === "patch")'), false);
    });
    await t.test('resultado aplicado sin confirmación se consulta, sin reenvío ni éxito ficticio', async () => {
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Ver perfil').click()`); await wait(`Boolean(${editor})`);
      await edit('900000006'); await click('Guardar número'); await wait(`${editor}.textContent.includes('Confirmas el cambio')`);
      await evaluate('profileTest.phone.confirmStatus = 500; profileTest.phone.applyBeforeError = true'); await click('Confirmar cambio');
      await wait(`${editor}.textContent.includes('No se pudo confirmar')`);
      assert.equal(await evaluate('profileTest.phone.value'), '900000006');
      const count = await evaluate(patchCount);
      await evaluate('profileTest.phone.confirmStatus = null; profileTest.phone.applyBeforeError = false'); await click('Consultar número actual');
      await wait(`Boolean(${editor}.querySelector('[aria-label="Editar celular"]'))`);
      assert.match(await evaluate(`${editor}.textContent`), /900000006/); assert.equal(await evaluate(patchCount), count);
      assert.doesNotMatch(await evaluate(`${editor}.textContent`), /Número actualizado/); await close();
    });
    await t.test('sin apoderado no se ofrece creación ni edición', async () => {
      await evaluate('profileTest.phone.noGuardian = true');
      await evaluate(`Array.from(${rows}[0].querySelectorAll('button')).find(b => b.textContent === 'Ver perfil').click()`);
      await wait(`${modal}.textContent.includes('Sin apoderado vinculado')`);
      assert.equal(await evaluate(`${modal}.querySelectorAll('input, [aria-label="Editar celular"]').length`), 0);
    });
  } finally { await ui.close(); }
});

test('ADMIN/SUBDIRECCION editan el celular conservando mes, resumen e historial completos', { skip: !hasEdge, timeout: 120000 }, async () => {
  const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
  const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
  try {
    await ui.navigate('/login?source=stats'); await wait('Boolean(window.profileTest)');
    for (const [role, phone] of [['ADMIN', '900000004'], ['SUBDIRECCION', '900000005']]) {
      await evaluate(`statisticsTest.role = ${JSON.stringify(role)}`); await ui.login(); await ui.setRoute('/estadisticas');
      await wait(`Boolean(document.querySelector('[aria-label="Seguimiento mensual"] table'))`);
      await evaluate(`document.querySelector('[aria-label="Seguimiento mensual"] tbody button').click()`);
      await wait(`Boolean(${modal}?.querySelector('[aria-label="Celular del apoderado"]'))`);
      const history = await evaluate(`${modal}.querySelector('table').textContent`), summary = await evaluate(`${modal}.querySelector('dl').textContent`);
      await evaluate(`${modal}.querySelector('[aria-label="Editar celular"]').click()`);
      await evaluate(`(() => { const e = ${modal}.querySelector('input[type=tel]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '${phone}'); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await click('Guardar número'); await wait(`${modal}.textContent.includes('Confirmas el cambio')`); await click('Confirmar cambio');
      await wait(`${modal}.textContent.includes('Número actualizado')`);
      assert.equal(await evaluate(`${modal}.querySelector('table').textContent`), history); assert.equal(await evaluate(`${modal}.querySelector('dl').textContent`), summary);
      assert.equal(await evaluate('profileTest.phone.value'), phone);
      await click('Volver'); await click('Cerrar sesión'); await wait('location.pathname === "/login"');
    }
  } finally { await ui.close(); }
});
