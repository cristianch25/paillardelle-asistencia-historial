import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAniosEscolaresRepository } from '../src/modules/organizacion-escolar/anios-escolares/repository.js';
import { createSeccionesRepository } from '../src/modules/organizacion-escolar/secciones/repository.js';
import { updateSection } from '../src/modules/organizacion-escolar/secciones/update.repository.js';
import { createCalendarWriter } from '../src/modules/organizacion-escolar/calendario-lectivo/write.repository.js';
import { createAssignmentsRepository } from '../src/modules/usuarios/usuarios.asignaciones.repository.js';
import { finalizeAssignment } from '../src/modules/usuarios/usuarios.asignaciones.finalize.repository.js';
import { createUsuariosRepository } from '../src/modules/usuarios/usuarios.repository.js';
import { createPasswordResetRepository } from '../src/modules/usuarios/usuarios.password.repository.js';
import { createSupervisionRepository } from '../src/modules/usuarios/usuarios.supervision.repository.js';
import { createEnrollmentRepository } from '../src/modules/matriculas/repository.js';
import { withdrawEnrollment } from '../src/modules/matriculas/withdraw.repository.js';
import { changeSection } from '../src/modules/matriculas/section-change.repository.js';
import { reingresoEnrollment } from '../src/modules/matriculas/reingreso.repository.js';
import { createAttendanceContext } from '../src/modules/asistencias/context.repository.js';
import { createGuardianPhoneRepository } from '../src/modules/estudiantes/phone.repository.js';
import { createConfirmationRepository } from '../src/modules/importaciones/confirmation.repository.js';

function fixture() {
  const calls = [], events = [];
  const connection = { beginTransaction: async () => events.push('begin'), rollback: async () => events.push('rollback'),
    commit: async () => events.push('commit'), release: () => events.push('release'),
    query: async () => [[]],
    async execute(sql) {
      calls.push(sql);
      assert.match(sql, /^SELECT /);
      assert.match(sql, /FROM usuarios/);
      return [[{ id: '1', rol: 'ADMIN', activo: 1, debe_cambiar_password: 1 }]];
    } };
  return { pool: { getConnection: async () => connection }, calls, events };
}
const noop = () => {};
const operations = [
  ['alta usuario', pool => createUsuariosRepository(() => pool).create({}, '1', noop)],
  ['editar usuario', pool => createUsuariosRepository(() => pool).update('2', '1', {}, noop)],
  ['restablecer', pool => createPasswordResetRepository(() => pool).reset('2', 'HASH_FICTICIO', '1', noop, noop)],
  ['supervisión', pool => createSupervisionRepository(() => pool).update('2', '1', [], noop)],
  ['crear año', pool => createAniosEscolaresRepository(() => pool).create({}, '1', noop)],
  ['abrir año', pool => createAniosEscolaresRepository(() => pool).open('2', '1', noop, noop)],
  ['cerrar año', pool => createAniosEscolaresRepository(() => pool).close('2', '1', noop, noop)],
  ['crear sección', pool => createSeccionesRepository(() => pool).create({}, '1', noop)],
  ['editar sección', pool => updateSection(pool, noop, '2', '1', noop, noop)],
  ['calendario', pool => createCalendarWriter(() => pool).change({}, '1', noop, noop)],
  ['asignar', pool => createAssignmentsRepository(() => pool).create({}, '1', {})],
  ['finalizar asignación', pool => finalizeAssignment(pool, {}, '1', {})],
  ['identidad estudiante', pool => createEnrollmentRepository(() => pool).standalone('1', noop)],
  ['matrícula', pool => createEnrollmentRepository(() => pool).create({}, '1', {})],
  ['retirar', pool => withdrawEnrollment(pool, '2', {}, '1', {})],
  ['cambiar sección', pool => changeSection(pool, '2', {}, '1', {})],
  ['reingresar', pool => reingresoEnrollment(pool, '2', {}, '1', {})],
  ['asistencia', pool => createAttendanceContext(() => pool).transact({}, '1', {}, noop, noop)],
  ['teléfono', pool => createGuardianPhoneRepository(() => pool).transact('1', noop)],
  ['confirmar importación', pool => createConfirmationRepository(() => pool).transact('1', noop)],
];
for (const [name, run] of operations) {
  test(`ADMIN pendiente bajo bloqueo: ${name} rechaza antes de efectos institucionales`, async () => {
    const f = fixture();
    await assert.rejects(run(f.pool), { status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    assert.equal(f.events.includes('commit'), false);
    assert.equal(f.events.includes('rollback'), true);
    assert(f.calls.some(sql => sql.includes('debe_cambiar_password') && sql.endsWith('FOR UPDATE')));
  });
}
