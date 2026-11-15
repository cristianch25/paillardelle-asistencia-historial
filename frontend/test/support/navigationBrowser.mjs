import { authBrowser } from './authBrowser.mjs';

export async function navigationBrowser() {
  const ui = await authBrowser('navigationHarness.jsx');
  const { evaluate, wait, click, command } = ui;
  const dialog = `document.querySelector('dialog[open][aria-describedby]')`;
  const rows = `Array.from(document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li'))`;
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await ui.navigate('/login');
  async function choose(index, label) {
    await evaluate(`Array.from(${rows}[${index}].querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
    await wait(`${rows}[${index}].querySelector('button[aria-pressed="true"]').textContent.trim() === ${JSON.stringify(label)}`);
  }
  async function setDate(value) {
    await evaluate(`(() => { const input = document.querySelector('input[type=date]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  async function prepare() {
    if (await evaluate(`Boolean(${dialog})`)) await click('Continuar registrando');
    if (await evaluate('Boolean(document.querySelector("#main-content"))')) {
      await click('Cerrar sesión');
      if (await evaluate(`Boolean(${dialog})`)) await click('Salir sin guardar');
      await wait('location.pathname === "/login"');
    }
    await evaluate('navigationTest.reset(); authTest.offset = 0; authTest.meStatus = null');
    await ui.login();
    await evaluate(`document.querySelector('aside a[href="/secciones"]').click()`);
    await wait(`Boolean(document.querySelector('button[aria-label^="Asistencia diaria de 4"]'))`);
    await evaluate(`document.querySelector('button[aria-label^="Asistencia diaria de 4"]').click()`);
    await wait('location.pathname === "/secciones/asistencia"');
    await setDate('2026-11-13'); await click('Abrir asistencia'); await wait(`${rows}.length === 4`);
  }
  return { ...ui, dialog, rows, choose, prepare, setDate,
    guard: () => wait(`Boolean(${dialog})`),
    dirty: () => evaluate(`${rows}.filter(row => row.textContent.includes('Sin guardar')).length`),
    cancel: async () => { await click('Continuar registrando'); await wait(`!${dialog}`); },
    confirm: async () => { await click('Salir sin guardar'); await wait(`!${dialog}`); },
    menu: async path => {
      await evaluate(`document.querySelector('button[aria-label="Abrir menú principal"]').click()`);
      await wait(`document.querySelector('dialog[aria-label="Menú principal"]').open`);
      await evaluate(`document.querySelector(${JSON.stringify(`dialog[aria-label="Menú principal"] a[href="${path}"]`)}).click()`);
    },
    save: async () => { await click('Guardar avances'); await wait('document.body.textContent.includes("Avances guardados correctamente")'); },
    touchMark: async () => {
      const selector = `${rows}[0].querySelector('button')`;
      await evaluate(`${selector}.scrollIntoView({ block: 'center' })`);
      const point = await evaluate(`(() => { const r = ${selector}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      await wait(`${rows}[0].textContent.includes('Sin guardar')`);
    } };
}
