import { mkdir, open, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { users } from './demo-data.js';

const directory = new URL('../../tmp/', import.meta.url);
export const manifestPath = new URL('demo-2026.manifest.json', directory);
export const credentialsPath = new URL('demo-2026.credentials.json', directory);
const lockPath = new URL('demo-2026.lock', directory);
export async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveState(state) {
  const temp = new URL('demo-2026.manifest.next', directory);
  await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(temp, manifestPath);
}
export async function lockDemo() {
  await mkdir(directory, { recursive: true });
  const lock = await open(lockPath, 'wx', 0o600);
  return async () => { await lock.close(); await unlink(lockPath); };
}
export async function createCredentials() {
  const credentials = Object.fromEntries(users.map(user => [user.usuario, randomBytes(18).toString('base64url')]));
  await writeFile(credentialsPath, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
  return credentials;
}

// La marca pendiente se guarda ANTES de invocar el servicio. Cualquier fallo exige revisión manual.
export async function runStep(state, key, work, inspect, save, validate) {
  if (Object.hasOwn(state.completed, key)) return state.completed[key];
  const current = await inspect();
  validate.before(state, current);
  state.pending = key;
  await save(state);
  const result = await work();
  const after = await inspect();
  validate.after(current.snapshot, after.snapshot);
  state.snapshot = after.snapshot;
  state.completed[key] = result;
  state.pending = null;
  await save(state);
  return result;
}
