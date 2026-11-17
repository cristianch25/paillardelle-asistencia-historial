import { authBrowser } from './authBrowser.mjs';

export async function sectionSearchBrowser(harness = 'sectionSearchHarness.jsx') {
  const ui = await authBrowser(harness);
  const { evaluate, wait, click } = ui;
  const results = `document.querySelector('[aria-label="Resultados de secciones"]')`;
  const rows = `Array.from(document.querySelectorAll('ul[aria-label="Secciones disponibles"] > li'))`;
  const search = `document.querySelector('input[type="search"]')`;
  const calls = `sectionSearchTest.calls.filter(c => c.url === '/secciones/')`;
  async function change(selector, value) {
    await evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(e.tagName === 'SELECT'
      ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
      e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  }
  async function signIn(role = 'ADMIN', allowed = ['PRIMARIA', 'INICIAL', 'SECUNDARIA'], holdPage = 0) {
    if (await evaluate('Boolean(document.querySelector("#main-content"))')) {
      await click('Cerrar sesión'); await wait('location.pathname === "/login"');
    }
    await evaluate(`Object.assign(sectionSearchTest, { role: ${JSON.stringify(role)}, allowedLevels: ${JSON.stringify(allowed)},
      level: ${role === 'ADMIN' ? 'null' : '"PRIMARIA"'}, account: String(BigInt(sectionSearchTest.account) + 1n),
      failPage: 0, holdPage: ${holdPage}, disappear: false, total: 230, invalidPage: 0 })`);
    await ui.login(); await ui.setRoute('/secciones');
    await wait(role === 'REGISTRADOR' ? `${rows}.length === 1` : `Boolean(${search})`);
  }
  return { ...ui, results, rows, search, calls, change, signIn,
    chooseYear: value => change(`document.querySelector('[aria-label="Búsqueda de secciones"] select')`, value),
    type: value => change(search, value), ready: () => wait(`Boolean(${results})`),
    release: () => evaluate('sectionSearchTest.pending.shift()()') };
}
