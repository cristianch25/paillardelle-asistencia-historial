import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authBrowser } from './support/authBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

for (const role of ['ADMIN', 'SUBDIRECCION']) test(`${role}: perfil sencillo usa Lima al abrir, sin polling y con celular actualizado`,
  { skip: !hasEdge, timeout: 120000 }, async () => {
    const ui = await authBrowser('studentProfileHarness.jsx'), { evaluate, wait, click } = ui;
    const modal = `document.querySelector('dialog[open][aria-label="Perfil individual del estudiante"]')`;
    const followup = `document.querySelector('[aria-label="Seguimiento mensual"]')`;
    const open = async () => {
      await evaluate(`${followup}.querySelector('tbody button').click()`);
      await wait(`Boolean(${modal}?.querySelector('[aria-label="Datos del perfil individual"]'))`);
    };
    try {
      await ui.command('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
      await ui.navigate('/login?source=stats'); await wait('Boolean(window.profileTest)');
      await evaluate(`{
        const NativeDate = Date, instant = NativeDate.parse('2026-12-01T02:00:00Z');
        window.Date = class extends NativeDate {
          constructor(...args) { if (args.length) super(...args); else super(instant); }
          static now() { return instant; }
        };
      }`);
      await evaluate(`statisticsTest.role = '${role}'`); await ui.login(); await ui.setRoute('/estadisticas');
      await wait(`Boolean(${followup}?.querySelector('table'))`);
      await evaluate(`(() => { const select = document.querySelector('[aria-label="Filtros de estadísticas"] select');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '2');
        select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await wait(`${followup}.querySelector('input').value.startsWith('2025') && Boolean(${followup}.querySelector('table'))`);
      // El origen está en otro año; el perfil debe consultar noviembre actual en Lima.
      await evaluate(`(() => { const input = ${followup}.querySelector('input[type=month]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2025-10');
        input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await wait(`statisticsTest.calls.at(-1).params?.mes === '2025-10' && Boolean(${followup}.querySelector('table'))`);
      await open();
      assert.equal(await evaluate('new Date().getMonth()'), 11); // Diciembre en el dispositivo.
      assert.equal(await evaluate('profileTest.calls.at(-1).params.mes'), '2026-11');
      assert.equal(await evaluate('profileTest.calls.at(-1).params.anio_escolar_id'), '9007199254741100');
      assert.match(await evaluate(`${modal}.textContent`), /noviembre de 2026/);
      assert.doesNotMatch(await evaluate(`${modal}.textContent`), /Mes del perfil|Actualizar perfil|Sección actual|Secciones del período|Incidencias justificadas|Vínculo activo/);
      assert.equal(await evaluate(`${modal}.querySelectorAll('select,input[type=month]').length`), 0);
      assert.equal(await evaluate(`${modal}.querySelectorAll('dl dt').length`), 4);
      assert.equal(await evaluate(`${modal}.querySelector('strong').textContent`), 'Apoderada actual');
      assert.match(await evaluate(`${modal}.querySelector('table').textContent`), /03\/11\/2026.*Falta.*Aviso vigente/);
      const count = await evaluate('profileTest.calls.length');
      await evaluate('new Promise(resolve => setTimeout(resolve, 250))');
      assert.equal(await evaluate('profileTest.calls.length'), count);
      await evaluate(`${modal}.querySelector('[aria-label="Editar celular"]').click()`);
      await evaluate(`(() => { const input = ${modal}.querySelector('input[type=tel]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '900000009');
        input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await click('Guardar número'); await wait(`${modal}.textContent.includes('Confirmas el cambio')`);
      await click('Confirmar cambio'); await wait(`${modal}.textContent.includes('Número actualizado')`);
      assert.match(await evaluate(`${modal}.querySelector('[aria-label="Celular del apoderado"]').textContent`), /900000009/);
      await click('Volver');
      assert.equal(await evaluate(`${followup}.querySelector('input').value`), '2025-10');
      await evaluate('profileTest.empty = true'); await open();
      assert.equal(await evaluate(`${modal}.querySelectorAll('dl dd').length`), 4);
      assert.deepEqual(await evaluate(`Array.from(${modal}.querySelectorAll('dl dd'), e => e.textContent)`), ['0', '0', '0', '0']);
      assert.match(await evaluate(`${modal}.querySelector('table').textContent`), /Sin sesión/);
      assert.doesNotMatch(await evaluate(`${modal}.textContent`), /Aviso vigente|No hay marcas individuales/);
      assert.match(await evaluate(`${modal}.querySelector('[aria-label="Celular del apoderado"]').textContent`), /900000009/);
      assert.equal(await evaluate('profileTest.calls.filter(c => c.method === "patch").length'), 1);
    } finally { await ui.close(); }
  });
