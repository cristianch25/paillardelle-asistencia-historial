import assert from 'node:assert/strict';
import { adminBody } from './superusuario-auth.cases.js';

export async function permissionCases(runCase, f, session) {
  const { technical, admin, superId } = session;
  await runCase('cuatro roles: gestión por actor, operación y destinatario', async () => {
    const adminSession = await f.login('su_admin_a');
    const actors = [technical, adminSession.access_token,
      (await f.login('su_sub')).access_token, (await f.login('su_reg')).access_token];
    for (const [index, token] of actors.entries()) {
      for (const role of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) {
        const allowed = index === 0 ? role === 'ADMIN' : index === 1 && ['SUBDIRECCION', 'REGISTRADOR'].includes(role);
        const body = { ...adminBody(`su_perm_${index}_${role.toLowerCase()}`), rol: role, nivel_asignado: 'PRIMARIA' };
        const before = await f.snapshot();
        const response = await f.request(token, 'POST', '/usuarios', body);
        assert.equal(response.status, index >= 2 ? 403 : role === 'SUPERUSUARIO' ? 400 : allowed ? 201 : 403);
        if (!allowed) assert.equal(await f.snapshot(), before);
      }
      if (index > 0) {
        assert.equal((await f.request(token, 'PATCH', `/usuarios/${admin}/estado`, { activo: false })).status, 403);
        assert.equal((await f.request(token, 'POST', `/usuarios/${admin}/restablecer-contrasena`, {})).status, 403);
      }
      assert.equal((await f.request(token, 'PATCH', `/usuarios/${f.ids.su_sub}`, { rol: 'ADMIN' })).status, 403);
    }
    const listed = await f.request(technical, 'GET', '/usuarios');
    assert.equal(listed.status, 200); assert.ok(listed.body.users.every(row => row.rol === 'ADMIN'));
    for (const target of [f.ids.su_sub, f.ids.su_reg, superId]) {
      for (const [method, suffix, body] of [['GET', '', undefined], ['PATCH', '/estado', { activo: false }],
        ['POST', '/restablecer-contrasena', {}]]) {
        assert.equal((await f.request(technical, method, `/usuarios/${target}${suffix}`, body)).status, 403);
      }
    }
    for (const target of [admin, superId]) {
      for (const [method, suffix, body] of [['PATCH', '', { nombres: 'No autorizado' }],
        ['PATCH', '/estado', { activo: false }], ['POST', '/restablecer-contrasena', {}]]) {
        assert.equal((await f.request(adminSession.access_token, method, `/usuarios/${target}${suffix}`, body)).status, 403);
      }
    }
    assert.equal((await f.request(technical, 'PATCH', `/usuarios/${admin}`, { nombres: 'No autorizado' })).status, 403);
    for (const flag of [false, true]) {
      assert.equal((await f.request(technical, 'POST', '/usuarios', { ...adminBody('su_flag'), debe_cambiar_password: flag })).status, 400);
      assert.equal((await f.request(technical, 'PATCH', `/usuarios/${admin}`, { debe_cambiar_password: flag })).status, 400);
    }
  });
  await runCase('SUPERUSUARIO sin acceso académico ni auditoría institucional', async () => {
    const before = await f.snapshot();
    for (const [method, endpoint, body] of [['GET', '/anios-escolares'], ['GET', '/auditoria'],
      ['POST', '/secciones', {}], ['POST', '/matriculas', {}],
      ['GET', '/asistencias/sesiones?anio_escolar_id=1&fecha=2026-11-20']]) {
      assert.equal((await f.request(technical, method, endpoint, body)).status, 403, `${method} ${endpoint}`);
    }
    assert.equal(await f.snapshot(), before);
  });
}
