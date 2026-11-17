import { authBrowser } from './authBrowser.mjs';
import { sessionId } from './supervisionDetailFixture.mjs';

export async function supervisionDetailBrowser() {
  const ui = await authBrowser('supervisionHarness.jsx');
  const { evaluate, wait } = ui;
  const rows = `Array.from(document.querySelectorAll('ul[aria-label="Estudiantes de la sesión"] > li'))`;
  const detail = `document.querySelector('[aria-label="Sesión consultada"]')`;
  const calls = `supervisionTest.calls.filter(c => c.url.startsWith('/asistencias/'))`;
  async function change(selector, value) {
    await evaluate(`(() => { const e = ${selector};
      Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
      e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  async function open(id = sessionId) {
    await ui.setRoute(`/asistencias/supervision/${id}`); await wait(`Boolean(${detail})`);
  }
  return { ...ui, rows, detail, calls, change, open, filter: value => change(`document.querySelector('[aria-label="Detalle por estudiante"] select')`, value) };
}
