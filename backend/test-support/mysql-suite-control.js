export function observedPool(pool, hooks) {
  return { execute: (...args) => pool.execute(...args), async getConnection() {
    const c = await pool.getConnection();
    try { await c.query('SET SESSION innodb_lock_wait_timeout=5'); } catch (error) { c.destroy(); throw error; }
    return new Proxy(c, { get(target, key) {
      if (key === 'execute') return async (sql, params) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        await hooks.before?.(normalized, params, c);
        const result = await target.execute(sql, params);
        await hooks.after?.(normalized, params, c);
        return result;
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}
// Esperar t.test no basta: también hay que comprobar el resultado real del contexto.
export function stopOnFailure(context) {
  let stopped = false;
  return async (name, options, work) => {
    if (stopped) throw new Error('Suite detenida tras un fallo.');
    if (typeof options === 'function') { work = options; options = {}; }
    let subtest, pending, failure;
    try {
      await context.test(name, options, child => {
        subtest = child; pending = Promise.resolve().then(() => work(child)); return pending;
      });
    } catch (error) { failure = error; }
    const [result] = await Promise.allSettled(pending ? [pending] : []);
    if (failure || subtest?.passed !== true || result?.status !== 'fulfilled') {
      stopped = true;
      throw failure ?? result?.reason ?? subtest?.error ?? new Error('Subprueba fallida o cancelada.');
    }
  };
}
export async function finishStarted(work, release) {
  const pending = [];
  try {
    return await work(operation => {
      const task = Promise.resolve().then(operation);
      pending.push(Promise.allSettled([task])); return task;
    });
  } finally {
    try { release(); } finally { await Promise.all(pending); }
  }
}
export function barrier() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { resolve, async wait() {
    let timer;
    try {
      await Promise.race([promise, new Promise((_done, reject) => {
        timer = setTimeout(() => reject(new Error('Barrera concurrente no alcanzada.')), 8000);
      })]);
    } finally { clearTimeout(timer); }
  } };
}
