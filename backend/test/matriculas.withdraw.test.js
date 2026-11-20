import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnrollmentController } from '../src/modules/matriculas/controller.js';
import { createEnrollmentRoutes } from '../src/modules/matriculas/routes.js';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

async function prepareEnrollment(fInstance, seccion_id = '11') {
  fInstance.state.years.get('1').estado = 'ABIERTO';
  const result = await fInstance.matriculas.createJoint(
    { ...enrollment, seccion_id, estudiante: identity, fecha_ingreso: '2026-03-01' },
    fInstance.actor('1'),
  );
  return result.matricula;
}

test('retiro exitoso por ADMIN: actualiza estado, fecha_retiro, fecha_fin de vínculo y audita', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  const result = await f.matriculas.withdraw(
    matricula.id,
    { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null },
    f.actor('1'),
  );
  assert.equal(result.id, matricula.id);
  assert.equal(result.estado, 'RETIRADA');
  assert.equal(result.fecha_retiro, '2026-06-15');

  assert.equal(f.state.matriculas[0].estado, 'RETIRADA');
  assert.equal(f.state.matriculas[0].fecha_retiro, '2026-06-15');
  assert.equal(f.state.links[0].fecha_fin, '2026-06-15');

  const audit = f.state.audits.find(a => a.accion === 'RETIRAR_MATRICULA');
  assert.ok(audit);
  assert.equal(audit.entidad, 'matriculas');
  assert.equal(audit.registro_id, matricula.id);
  assert.equal(audit.despues.estado, 'RETIRADA');
  assert.equal(audit.despues.fecha_retiro, '2026-06-15');
});

test('padrón por fecha: alumno aparece hasta fecha_retiro (inclusive) y desaparece al día siguiente', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  await f.matriculas.withdraw(
    matricula.id,
    { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null },
    f.actor('1'),
  );

  const padronDiaRetiro = await f.matriculas.padron('11', { fecha: '2026-06-15' }, f.actor('1'));
  assert.equal(padronDiaRetiro.padron.length, 1);
  assert.equal(padronDiaRetiro.padron[0].id, matricula.id);

  const padronDiaSiguiente = await f.matriculas.padron('11', { fecha: '2026-06-16' }, f.actor('1'));
  assert.equal(padronDiaSiguiente.padron.length, 0);
});

test('retiro exitoso por SUBDIRECCION autorizada en su nivel', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f, '11'); // 11 es PRIMARIA, actor 2 tiene PRIMARIA
  const result = await f.matriculas.withdraw(
    matricula.id,
    { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null },
    f.actor('2'),
  );
  assert.equal(result.estado, 'RETIRADA');
  assert.equal(f.state.matriculas[0].estado, 'RETIRADA');
});

test('SUBDIRECCION en sección de otro nivel no autorizada es rechazada', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f, '12'); // 12 es SECUNDARIA, actor 2 tiene PRIMARIA
  await assert.rejects(
    f.matriculas.withdraw(
      matricula.id,
      { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null },
      f.actor('2'),
    ),
    { status: 404 },
  );
  assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
});

test('rechaza retiro con fecha futura', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  await assert.rejects(
    f.matriculas.withdraw(
      matricula.id,
      { fecha_retiro: '2026-11-20', fecha_retiro_esperada: null }, // today es 2026-11-13
      f.actor('1'),
    ),
    { status: 400, message: 'La fecha de retiro no puede ser futura.' },
  );
  assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
});

test('rechaza retiro con fecha anterior al ingreso', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  await assert.rejects(
    f.matriculas.withdraw(
      matricula.id,
      { fecha_retiro: '2026-02-28', fecha_retiro_esperada: null },
      f.actor('1'),
    ),
    { status: 400, message: 'La fecha de retiro no puede ser anterior a la fecha de ingreso.' },
  );
  assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
});

test('rechaza retiro si el año escolar no está ABIERTO', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  f.state.years.get('1').estado = 'PLANIFICADO';
  await assert.rejects(
    f.matriculas.withdraw(
      matricula.id,
      { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null },
      f.actor('1'),
    ),
    { status: 409, message: 'Solo puede retirarse una matrícula en un año escolar ABIERTO.' },
  );
  assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
});

test('rechaza retiro si la matrícula ya se encuentra retirada', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  await f.matriculas.withdraw(
    matricula.id,
    { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null },
    f.actor('1'),
  );
  await assert.rejects(
    f.matriculas.withdraw(
      matricula.id,
      { fecha_retiro: '2026-06-20', fecha_retiro_esperada: null },
      f.actor('1'),
    ),
    { status: 409, message: 'La matrícula no está activa o ya se encuentra retirada.' },
  );
});

test('rechaza retiro si fecha_retiro_esperada no coincide con el valor actual (OCC)', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  await assert.rejects(
    f.matriculas.withdraw(
      matricula.id,
      { fecha_retiro: '2026-06-15', fecha_retiro_esperada: '2026-05-01' },
      f.actor('1'),
    ),
    { status: 409, message: 'La matrícula cambió. Actualiza la consulta antes de continuar.' },
  );
});

test('rechaza retiro si existen asistencias posteriores a la fecha seleccionada', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  f.state.attendances.push({
    id: '100',
    matricula_id: matricula.id,
    fecha: '2026-06-16',
    estado: 'PRESENTE',
  });

  await assert.rejects(
    f.matriculas.withdraw(
      matricula.id,
      { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null },
      f.actor('1'),
    ),
    { status: 409, message: 'No se puede retirar: existen asistencias registradas posteriores a la fecha seleccionada.' },
  );
  assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
  assert.equal(f.state.matriculas[0].fecha_retiro, null);
  assert.equal(f.state.links[0].fecha_fin, null);
});

test('controller y router configuran la ruta PATCH /:id/retiro para ADMIN y SUBDIRECCION', async () => {
  const f = studentsFixture();
  const matricula = await prepareEnrollment(f);
  const controller = createEnrollmentController(f.matriculas);

  let jsonResponse;
  const res = {
    json(data) { jsonResponse = data; },
  };
  await controller.withdraw(
    { params: { id: matricula.id }, body: { fecha_retiro: '2026-06-15', fecha_retiro_esperada: null }, authUser: f.actor('1') },
    res,
  );
  assert.equal(jsonResponse.id, matricula.id);
  assert.equal(jsonResponse.estado, 'RETIRADA');
  assert.equal(jsonResponse.fecha_retiro, '2026-06-15');

  const { router } = createEnrollmentRoutes({ verifySession: async () => f.actor('1') }, f.matriculas);
  const retiroRoute = router.stack.find(layer => layer.route?.path === '/:id/retiro');
  assert.ok(retiroRoute);
  assert.ok(retiroRoute.route.methods.patch);
});
