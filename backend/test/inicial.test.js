import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateNewUser, validateUserPatch } from '../src/modules/usuarios/usuarios.validation.js';
import { validateNewSection, validateSectionQuery } from '../src/modules/organizacion-escolar/secciones/validation.js';
import { createSeccionesService } from '../src/modules/organizacion-escolar/secciones/service.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { sectionBody, admin, sectionsPool } from '../test-support/secciones-pool.js';
import bcrypt from 'bcrypt';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/auth.tokens.js';

test('INICIAL: grupos 4/5 y nombres completos, VARCHAR(30), filtros y turnos sin cambios', () => {
  for (const [grado, letra] of [[4, 'CREATIVOS'], [5, 'GENIALES']]) {
    const body = { ...sectionBody, nivel: 'INICIAL', grado, letra };
    assert.deepEqual(validateNewSection(body), body);
    assert.equal(validateSectionQuery({ nivel: 'INICIAL', grado: String(grado) }).filters.grado, grado);
  }
  assert.equal(validateNewSection({ ...sectionBody, letra: 'á'.repeat(30) }).letra.length, 30);
  for (const grado of [0, 1, 2, 3, 6, '4', null, 4.5]) {
    assert.throws(() => validateNewSection({ ...sectionBody, nivel: 'INICIAL', grado }), { status: 400 });
  }
  for (const grado of ['1', '3', '6']) {
    assert.throws(() => validateSectionQuery({ nivel: 'INICIAL', grado }), { status: 400 });
  }
  assert.throws(() => validateNewSection({ ...sectionBody, letra: 'x'.repeat(31) }), { status: 400 });
});

test('usuarios admite INICIAL sin nuevos roles ni cambios de tipos', () => {
  const body = { nombres: 'Nombre', apellidos: 'Ficticio', usuario: 'prueba', password: 'clave',
    rol: 'SUBDIRECCION', nivel_asignado: 'INICIAL' };
  assert.equal(validateNewUser(body).nivel_asignado, 'INICIAL');
  assert.deepEqual(validateUserPatch({ nivel_asignado: 'INICIAL' }), { nivel_asignado: 'INICIAL' });
  for (const nivel_asignado of ['inicial', 'OTRO', [], 1]) {
    assert.throws(() => validateUserPatch({ nivel_asignado }), { status: 400 });
  }
});

test('INICIAL se crea con auditoría y sin truncamiento; no se generan salones automáticamente', async () => {
  const state = sectionsPool();
  const service = createSeccionesService({ repository: createSeccionesRepository(() => state.pool) });
  for (const [grado, letra] of [[4, 'CREATIVOS'], [5, 'GENIALES']]) {
    const section = await service.create({ ...sectionBody, nivel: 'INICIAL', grado, letra }, admin);
    assert.equal(section.letra, letra);
    assert.equal(section.grado, grado);
    assert.equal(section.nivel, 'INICIAL');
  }
  assert.equal(state.rows.length, 2);
  assert.equal(state.audits.length, 2);
});

test('secciones revalida niveles adicionales en la conexión bloqueada, sin confiar en permisos previos', async () => {
  const actor = { ...admin, rol: 'SUBDIRECCION', nivel_asignado: 'PRIMARIA' };
  const state = sectionsPool({ actor, additionalLevels: ['INICIAL'] });
  const service = createSeccionesService({ repository: createSeccionesRepository(() => state.pool) });
  const body = { ...sectionBody, nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' };
  await service.create(body, actor);
  state.beforeActor = async () => { state.additionalLevels = []; };
  await assert.rejects(service.create({ ...body, letra: 'OTROS' }, actor), { status: 403 });
  assert.equal(state.rows.length, 1);
  const calls = state.events[0].filter(item => item.sql);
  const permission = calls.findIndex(item => item.sql.includes('FROM usuario_niveles_adicionales'));
  const insert = calls.findIndex(item => item.sql.startsWith('INSERT INTO secciones'));
  assert(permission > 0 && permission < insert);
  assert.match(calls[permission].sql, /FOR UPDATE$/);
});

test('login y autenticación INICIAL conservan el contrato y JWT sin niveles ni permisos persistidos', async () => {
  const user = { id: '9007199254740993', usuario: 'profesora_ficticia', rol: 'REGISTRADOR',
    activo: 1, nivel_asignado: 'INICIAL', password_hash: await bcrypt.hash('clave_ficticia', 4) };
  const tokens = createTokenService(() => ({ secret: 'secreto-ficticio-inicial-solo-pruebas-123456789', expiresIn: 900 }));
  const auth = createAuthService({ tokens, repository: {
    findByUsername: async () => user, findById: async () => user,
  } });
  const result = await auth.login({ usuario: user.usuario, password: 'clave_ficticia' });
  assert.equal(result.user.nivel_asignado, 'INICIAL');
  assert.equal((await auth.authenticate(result.access_token)).id, user.id);
  const claims = JSON.parse(Buffer.from(result.access_token.split('.')[1], 'base64url').toString());
  assert.equal(Object.hasOwn(claims, 'nivel_asignado'), false);
  assert.equal(Object.hasOwn(claims, 'niveles_adicionales'), false);
  assert.equal(Object.hasOwn(result.user, 'password_hash'), false);
});
