import assert from 'node:assert/strict';
import { test } from 'node:test';
import { users } from '../scripts/lib/demo-data.js';
import { validateNewUser, validateUserPatch } from '../src/modules/usuarios/usuarios.validation.js';
import { publicUser } from '../src/modules/usuarios/usuarios.service.js';
import { scopeFor } from '../src/modules/asistencias/rules.js';

const expected = { 'demo26-reg-ini': 'DOCENTE', 'demo26-reg-pri': 'DOCENTE', 'demo26-reg-sec': 'AUXILIAR',
  'demo26-sub-pri': 'SUBDIRECTOR', 'demo26-sub-sec': 'SUBDIRECTOR' };
test('demo: las cinco cuentas incluyen el cargo aprobado sin confundirlo con rol', () => {
  assert.deepEqual(Object.fromEntries(users.map(user => [user.usuario, user.cargo])), expected);
  for (const { key, ...user } of users) {
    const valid = validateNewUser({ ...user, password: 'Contraseña exclusivamente ficticia' });
    assert.equal(valid.cargo, expected[user.usuario]);
    assert.equal(valid.rol, key.startsWith('reg-') ? 'REGISTRADOR' : 'SUBDIRECCION');
    assert.deepEqual(validateUserPatch({ cargo: user.cargo }), { cargo: user.cargo });
  }
});
test('perfil público: conserva cargo y rol separados sin exponer secretos', () => {
  for (const user of users) {
    const profile = publicUser({ ...user, id: '4', password_hash: 'NO_EXPONER' });
    assert.equal(profile.cargo, expected[user.usuario]); assert.equal(profile.rol, user.rol);
    assert.equal(Object.hasOwn(profile, 'password_hash'), false);
  }
});
test('permisos: DOCENTE y AUXILIAR conservan el mismo ámbito por asignación de REGISTRADOR', async () => {
  const userService = { historicalSectionIds: async () => ['1'] };
  for (const cargo of ['DOCENTE', 'AUXILIAR']) {
    const access = await scopeFor({ id: '4', rol: 'REGISTRADOR', cargo, activo: true },
      '2026-11-13', '2026-11-15', userService, {});
    assert.deepEqual(access, { ids: ['1'] });
  }
});
