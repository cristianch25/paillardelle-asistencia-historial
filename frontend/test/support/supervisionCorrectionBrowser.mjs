import { authBrowser } from './authBrowser.mjs';

export async function supervisionCorrectionBrowser() {
  const ui = await authBrowser('supervisionCorrectionHarness.jsx');
  const { evaluate, wait, click } = ui;
  const action = `document.querySelector('[aria-label="Corrección de asistencia"]')`;
  const rows = `Array.from(${action}?.querySelectorAll('ul > li') ?? [])`;
  const detail = action;
  const writes = `supervisionCorrectionTest.calls.filter(c => c.method === 'patch')`;
  async function change(selector, value) {
    await evaluate(`(() => { const e = ${selector};
      Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')
        .set.call(e, ${JSON.stringify(value)});
      e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  }
  async function load(state = 'ABIERTA') {
    await evaluate(`supervisionCorrectionTest.reset(${JSON.stringify(state)})`);
    await refresh();
    await wait(`${rows}.length === 5 && Boolean(${action})`);
  }
  async function open() {
    await ui.setRoute('/asistencias/gestion');
    await wait('Boolean(document.querySelector("input[type=date]"))');
    await change('document.querySelector("input[type=date]")', '2026-11-15');
    await change('document.querySelector("input[type=search]")', '');
    await wait(`Boolean(${detail}) || Boolean(document.querySelector('[role=alert]'))`);
  }
  async function refresh() {
    await ui.setRoute('/inicio'); await wait('location.pathname === "/inicio"');
    await open();
  }
  async function signIn(role = 'SUBDIRECCION', level = 'PRIMARIA') {
    if (await evaluate('Boolean(document.querySelector("#main-content"))')) {
      await click('Cerrar sesión'); await wait('location.pathname === "/login"');
    }
    await evaluate(`Object.assign(supervisionTest, { role: ${JSON.stringify(role)}, level: ${JSON.stringify(level)},
      account: String(BigInt(supervisionTest.account) + 1n) })`);
    await ui.login();
  }
  async function edit(state = 'FALTA', reason = '') {
    await change('document.querySelector("input[type=search]")', 'Estudiante 1');
    await wait(`Boolean(${action}) && ${action}.querySelectorAll('ul button').length === 1`);
    await evaluate(`${action}.querySelector('ul button').click()`);
    await wait(`${action}.querySelector('ul button').getAttribute('aria-pressed') === 'true'`);
    await click('Actualizar asistencia'); await wait('Boolean(document.querySelector("dialog[open] select"))');
    await change('document.querySelector("dialog[open] select")', state);
    if (await evaluate('Boolean(document.querySelector("dialog[open] input"))')) {
      await change('document.querySelector("dialog[open] input")', reason);
    }
  }
  async function confirm() {
    await click('Revisar corrección'); await wait('document.querySelector("dialog[open] h2")?.textContent === "Confirmar corrección"');
    await click('Confirmar y guardar');
  }
  return { ...ui, action, rows, detail, writes, change, load, open, refresh, signIn, edit, confirm,
    saved: () => wait(`document.body.textContent.includes("Corrección guardada correctamente") && !document.querySelector("dialog[open]") && Boolean(${action})`) };
}
