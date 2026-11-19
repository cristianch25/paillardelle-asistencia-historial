import { createServer } from 'vite';
import { launchEdge, waitFor } from './edgeBrowser.mjs';

export async function attendanceBrowser() {
  const vite = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await vite.listen();
  let browser;
  try {
    browser = await launchEdge();
    const { evaluate, command } = browser;
    const button = label => label === 'Abrir asistencia' ? `document.querySelector('button[aria-describedby="opening-hint"]')`
      : `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
    const rows = `Array.from(document.querySelectorAll('ul[aria-label="Estudiantes y marcas actuales"] > li'))`;
    const wait = (expression, label = expression) => waitFor(() => evaluate(expression), label);
    const click = label => label === 'Abrir asistencia' ? wait(`${rows}.length === 4`) : evaluate(`${button(label)}.click()`);
    await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await command('Page.navigate', { url: `${vite.resolvedUrls.local[0]}test/support/attendance.html` });
    await wait(`${rows}.length === 4`);
    async function reset(setup = '') {
      await evaluate(`attendanceTest.reset(); ${setup}; attendanceTest.render()`);
      await wait(`${rows}.length === 4 && attendanceTest.calls.some(call => call.method === 'get' && call.url.includes('/sesiones/'))`);
    }
    async function choose(index, label) {
      await evaluate(`Array.from(${rows}[${index}].querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
      await wait(`${rows}[${index}].querySelector('button[aria-pressed="true"]').textContent.trim() === ${JSON.stringify(label)}`);
    }
    return { evaluate, command, button, rows, wait, click, reset, choose,
      patches: () => evaluate('attendanceTest.calls.filter(call => call.method === "patch")'),
      dirty: () => evaluate(`${rows}.filter(row => row.textContent.includes('Sin guardar')).length`),
      values: () => evaluate(`${rows}.map(row => row.querySelector('button[aria-pressed="true"]')?.textContent.trim())`),
      settled: () => wait(`Boolean(${button('Guardar cambios')}) && !document.querySelector('[aria-label="Guardado de asistencia"]').matches('[aria-busy="true"]')`),
      close: async () => { await browser.close(); await vite.close(); } };
  } catch (error) { await browser?.close(); await vite.close(); throw error; }
}
