import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { localPassword } from './superusuario-inicial.cases.js';

export const adminBody = usuario => ({ nombres: 'Admin', apellidos: 'Sintetico', usuario,
  password: 'Inicial-Sintetica3312', rol: 'ADMIN' });
export async function changePassword(f, token, current, next) {
  return f.request(token, 'POST', '/auth/cambiar-contrasena', {
    password_actual: current, password_nueva: next, password_confirmacion: next });
}
export async function authCases(runCase, f, superId) {
  let technical, admin, adminToken;
  await runCase('login y perfil SUPERUSUARIO, firma y credenciales inválidas', async () => {
    const response = await f.request(null, 'POST', '/auth/login', { usuario: 'su_tecnico', password: localPassword });
    assert.equal(response.status, 200); technical = response.body.access_token;
    assert.equal(response.body.user.id, superId); assert.equal(response.body.user.rol, 'SUPERUSUARIO');
    assert.equal((await f.request(technical, 'GET', '/auth/me')).status, 200);
    assert.equal((await f.request(null, 'GET', '/auth/me')).status, 401);
    assert.equal((await f.request(`${technical}x`, 'GET', '/auth/me')).status, 401);
    assert.equal((await f.request(null, 'POST', '/auth/login', { usuario: 'su_tecnico', password: 'incorrecta' })).status, 401);
    assert.equal((await changePassword(f, technical, localPassword, 'Tecnico-Nueva3312')).status, 200);
    assert.equal((await f.login('su_tecnico', 'Tecnico-Nueva3312')).user.id, superId);
    assert.equal((await f.request(technical, 'GET', '/auth/me')).status, 200);
  });
  await runCase('SUPERUSUARIO crea ADMIN y servidor impone cambio obligatorio', async () => {
    const created = await f.request(technical, 'POST', '/usuarios', adminBody('su_admin_nuevo'));
    assert.equal(created.status, 201); admin = created.body.user.id;
    assert.equal(created.body.user.debe_cambiar_password, true);
    const session = await f.login('su_admin_nuevo', adminBody('').password); adminToken = session.access_token;
    assert.equal(session.user.debe_cambiar_password, true);
    assert.equal((await f.request(adminToken, 'GET', '/auth/me')).status, 200);
    for (const [method, endpoint, body] of [['GET', '/usuarios'], ['GET', '/anios-escolares'],
      ['POST', '/usuarios', { ...adminBody('no_crear'), rol: 'REGISTRADOR' }]]) {
      const response = await f.request(adminToken, method, endpoint, body);
      assert.equal(response.status, 403); assert.equal(response.body.code, 'PASSWORD_CHANGE_REQUIRED');
    }
    const before = await f.snapshot();
    assert.equal((await changePassword(f, adminToken, 'incorrecta', 'Nueva-Sintetica3312')).status, 400);
    assert.equal((await changePassword(f, adminToken, adminBody('').password, adminBody('').password)).status, 400);
    assert.equal(await f.snapshot(), before);
    assert.equal((await changePassword(f, adminToken, adminBody('').password, 'Nueva-Sintetica3312')).status, 200);
    const row = await f.account(admin);
    assert.equal(row.debe_cambiar_password, 0);
    assert.equal(await bcrypt.compare('Nueva-Sintetica3312', row.password_hash), true);
    assert.equal((await f.request(adminToken, 'GET', '/usuarios')).status, 200);
  });
  await runCase('reset ADMIN, JWT previo restringido y posterior recuperación sin revocación', async () => {
    const reset = await f.request(technical, 'POST', `/usuarios/${admin}/restablecer-contrasena`, {});
    assert.equal(reset.status, 200); assert.equal(typeof reset.body.password_temporal, 'string');
    const blocked = await f.request(adminToken, 'GET', '/usuarios');
    assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
    await assert.rejects(f.login('su_admin_nuevo', 'Nueva-Sintetica3312'), { status: 401 });
    const session = await f.login('su_admin_nuevo', reset.body.password_temporal);
    assert.equal((await changePassword(f, session.access_token, reset.body.password_temporal, 'Final-Sintetica3312')).status, 200);
    assert.equal((await f.request(adminToken, 'GET', '/usuarios')).status, 200);
    const [audits] = await f.pool.execute('SELECT * FROM auditoria_administrativa ORDER BY id');
    const row = await f.account(admin);
    for (const secret of [reset.body.password_temporal, row.password_hash, technical, adminToken]) {
      assert.equal(JSON.stringify(audits).includes(secret), false);
    }
  });
  await runCase('desactivar/reactivar ADMIN conserva cuenta y limita JWT', async () => {
    const before = await f.account(admin);
    assert.equal((await f.request(technical, 'PATCH', `/usuarios/${admin}/estado`, { activo: false })).status, 200);
    assert.equal((await f.request(adminToken, 'GET', '/auth/me')).status, 401);
    await assert.rejects(f.login('su_admin_nuevo', 'Final-Sintetica3312'), { status: 401 });
    assert.equal((await f.request(technical, 'PATCH', `/usuarios/${admin}/estado`, { activo: true })).status, 200);
    const after = await f.account(admin);
    assert.ok(after.password_hash === before.password_hash); assert.equal(after.debe_cambiar_password, 0);
    assert.equal((await f.request(adminToken, 'GET', '/auth/me')).status, 200);
    await f.originalAccountsUnchanged();
  });
  return { technical, admin, adminToken, superId };
}
