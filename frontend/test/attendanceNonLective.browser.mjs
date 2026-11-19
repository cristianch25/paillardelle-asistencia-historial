import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendanceBrowser } from './support/attendanceBrowser.mjs';
import { hasEdge } from './support/edgeBrowser.mjs';

test('día no lectivo y futuro: consulta automática sin marcas, acciones masivas ni guardado',
  { skip: !hasEdge, timeout: 90000 }, async () => {
    const ui = await attendanceBrowser();
    const { evaluate, wait, rows } = ui;
    async function date(value) {
      await evaluate(`(() => { const field = document.querySelector('input[type=date]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)});
        field.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await wait(`${rows}.length === 4`);
    }
    try {
      await evaluate('attendanceTest.calendar.es_lectivo = false'); await date('2026-11-12');
      await wait('document.body.textContent.includes("Hoy no hay clases. La asistencia está deshabilitada para esta fecha")');
      assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed], [role=alert]").length'), 0);
      assert.doesNotMatch(await evaluate('document.body.textContent'), /Guardar cambios|Marcar todos|Abrir asistencia|Si ya existe/);
      assert.equal(await evaluate('attendanceTest.calls.filter(c => c.method !== "get").length'), 0);
      await evaluate('attendanceTest.calendar.es_lectivo = true'); await date('2026-12-01');
      await wait('document.body.textContent.includes("fecha futura")');
      assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'), 0);
      assert.equal((await ui.patches()).length, 0);
    } finally { await ui.close(); }
  });
