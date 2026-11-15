import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const edgePath = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const hasEdge = existsSync(edgePath);

export async function waitFor(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(40);
  }
  throw new Error(`Tiempo agotado: ${message}`);
}

export async function launchEdge() {
  const directory = resolve('node_modules/.tmp');
  await mkdir(directory, { recursive: true });
  const profile = await mkdtemp(resolve(directory, 'attendance-edge-'));
  const child = spawn(edgePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let port;
    await waitFor(async () => {
      try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; return Boolean(port); }
      catch { return false; }
    }, 'iniciar Edge headless');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    const events = new Map();
    socket.addEventListener('message', event => {
      const result = JSON.parse(event.data), request = pending.get(result.id);
      if (result.method) events.get(result.method)?.forEach(listener => listener(result.params));
      if (!request) return;
      pending.delete(result.id);
      if (result.error) request.reject(new Error(result.error.message));
      else request.resolve(result.result);
    });
    function command(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolveResult, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Tiempo agotado: ${method}`)); }, 15000);
        pending.set(id, { resolve: result => { clearTimeout(timer); resolveResult(result); },
          reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    }
    return { command, evaluate, on: (method, listener) => {
      const listeners = events.get(method) ?? new Set(); events.set(method, listeners); listeners.add(listener);
      return () => listeners.delete(listener);
    }, close: async () => {
      await command('Browser.close').catch(() => {});
      socket.close();
      child.kill();
    } };
  } catch (error) {
    socket?.close(); child.kill(); throw error;
  }
}
