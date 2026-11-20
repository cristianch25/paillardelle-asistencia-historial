import { createServer } from 'vite';
import { launchEdge, waitFor } from './edgeBrowser.mjs';

export async function authBrowser(harness = 'authHarness.jsx') {
  const vite = await createServer({ cacheDir: `node_modules/.tmp/vite-${harness.replace(/\W/g, '-')}`,
    plugins: [{ name: 'auth-test-routes', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split('?')[0];
      if (!['/login', '/inicio', '/administradores', '/secciones', '/secciones/asistencia', '/asistencias', '/asistencias/diaria', '/usuarios', '/estadisticas'].includes(path)
        && !path?.startsWith('/asistencias/supervision') && !path?.startsWith('/asistencias/gestion')) return next();
      const html = `<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/test/support/${harness}"></script></body></html>`;
      res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, html));
    });
  } }], server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await vite.listen();
  let browser;
  try {
    browser = await launchEdge();
    const { evaluate, command } = browser, base = vite.resolvedUrls.local[0];
    const button = label => label === 'Abrir asistencia' ? `document.querySelector('button[aria-describedby="opening-hint"]')`
      : `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
    const wait = (expression, label = expression) => waitFor(() => evaluate(expression), label);
    const click = label => evaluate(`${button(label)}.click()`);
    const ready = previous => waitFor(async () => {
      try {
        return await evaluate(`Boolean(window.authTest) && authTest.documentId !== ${JSON.stringify(previous)}
          && Boolean(document.querySelector('input[name=usuario], #main-content, [role=alert]'))`);
      } catch (error) {
        // Solo repetir esta lectura de disponibilidad si F5 destruyó su contexto.
        if (/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(error.message)) return false;
        throw error;
      }
    }, 'documento de prueba disponible');
    async function navigate(path) {
      const previous = await evaluate('window.authTest?.documentId ?? null');
      await command('Page.navigate', { url: new URL(path, base).href });
      await ready(previous);
    }
    async function reload() {
      const previous = await evaluate('window.authTest?.documentId ?? null');
      await command('Page.reload', { ignoreCache: true });
      await ready(previous);
    }
    async function login(expectedPath = '/inicio') {
      await wait('Boolean(document.querySelector("input[name=usuario]"))');
      await evaluate(`(() => { for (const name of ['usuario', 'password']) {
        const input = document.querySelector('input[name="' + name + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'simulado');
        input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      await click('Iniciar sesión'); await wait(`location.pathname === ${JSON.stringify(expectedPath)} && Boolean(document.querySelector("#main-content"))`);
    }
    const setRoute = path => evaluate(`void authTest.navigate(${JSON.stringify(path)})`);
    return { evaluate, command, button, wait, click, navigate, reload, login, setRoute, on: browser.on,
      close: async () => { await browser.close(); await vite.close(); } };
  } catch (error) { await browser?.close(); await vite.close(); throw error; }
}
