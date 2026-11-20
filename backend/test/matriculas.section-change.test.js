import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnrollmentController } from '../src/modules/matriculas/controller.js';
import { createEnrollmentRoutes } from '../src/modules/matriculas/routes.js';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

async function prepare(f, seccion_id = '11') {
  f.state.years.get('1').estado = 'ABIERTO';
  f.state.sections.set('14', { id: '14', anio_escolar_id: '1', nivel: 'PRIMARIA', grado: 4, letra: 'B', activo: 1, turno: null });
  const result = await f.matriculas.createJoint(
    { ...enrollment, seccion_id, estudiante: identity, fecha_ingreso: '2026-03-01' },
    f.actor('1'),
  );
  return result.matricula;
}

test('cambio de sección exitoso por ADMIN: preserva matrícula ACTIVA, cierra vínculo anterior, abre nuevo y audita', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f);
  const result = await f.matriculas.changeSection(
    matricula.id,
    { seccion_id: '14', fecha_efectiva: '2026-05-20' },
    f.actor('1'),
  );
  assert.equal(result.id, matricula.id);
  assert.equal(result.estado, 'ACTIVA');
  assert.equal(result.seccion_anterior_id, '11');
  assert.equal(result.seccion_nueva_id, '14');
  assert.equal(result.fecha_efectiva, '2026-05-20');

  assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
  assert.equal(f.state.matriculas[0].fecha_retiro, null);
  assert.equal(f.state.links[0].fecha_fin, '2026-05-19');
  assert.equal(f.state.links[1].seccion_id, '14');
  assert.equal(f.state.links[1].fecha_inicio, '2026-05-20');
  assert.equal(f.state.links[1].fecha_fin, null);

  const audit = f.state.audits.find(a => a.accion === 'CAMBIO_SECCION');
  assert.ok(audit);
  assert.equal(audit.entidad, 'matriculas');
  assert.equal(audit.registro_id, matricula.id);
  assert.equal(audit.despues.seccion_id, '14');
  assert.equal(audit.despues.fecha_inicio, '2026-05-20');
});

test('padrón por fecha: alumno en sección origen antes de fecha_efectiva y en sección destino desde fecha_efectiva', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f);
  await f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('1'));

  const padronOrigenAntes = await f.matriculas.padron('11', { fecha: '2026-05-19' }, f.actor('1'));
  assert.equal(padronOrigenAntes.padron.length, 1);
  assert.equal(padronOrigenAntes.padron[0].id, matricula.id);

  const padronDestinoAntes = await f.matriculas.padron('14', { fecha: '2026-05-19' }, f.actor('1'));
  assert.equal(padronDestinoAntes.padron.length, 0);

  const padronOrigenDesde = await f.matriculas.padron('11', { fecha: '2026-05-20' }, f.actor('1'));
  assert.equal(padronOrigenDesde.padron.length, 0);

  const padronDestinoDesde = await f.matriculas.padron('14', { fecha: '2026-05-20' }, f.actor('1'));
  assert.equal(padronDestinoDesde.padron.length, 1);
  assert.equal(padronDestinoDesde.padron[0].id, matricula.id);
});

test('cambio exitoso por SUBDIRECCION autorizada en su nivel', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  const result = await f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('2'));
  assert.equal(result.seccion_nueva_id, '14');
});

test('SUBDIRECCION en sección de otro nivel no autorizada es rechazada', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('3')),
    err => err.status === 404,
  );
});

test('rechaza cambio entre secciones de distinto nivel o grado (Precisión 1)', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  // Distinto nivel ('12' es SECUNDARIA 4 A)
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '12', fecha_efectiva: '2026-05-20' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('mismo nivel y grado'),
  );
  // Distinto grado ('15' es PRIMARIA 5 A)
  f.state.sections.set('15', { id: '15', anio_escolar_id: '1', nivel: 'PRIMARIA', grado: 5, letra: 'A', activo: 1, turno: null });
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '15', fecha_efectiva: '2026-05-20' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('mismo nivel y grado'),
  );
});

test('rechaza cambio a la misma sección', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '11', fecha_efectiva: '2026-05-20' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('distinta'),
  );
});

test('rechaza cambio a sección inactiva', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  f.state.sections.get('14').activo = 0;
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('1')),
    err => err.status === 409 && err.message.includes('inactiva'),
  );
});

test('rechaza cambio con fecha futura', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-11-14' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('futura'),
  );
});

test('rechaza cambio si fecha efectiva es menor o igual al inicio del vínculo vigente', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  // fecha_ingreso / inicio vínculo es '2026-03-01'
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-03-01' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('posterior'),
  );
});

test('rechaza cambio si el año escolar no está ABIERTO', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  f.state.years.get('1').estado = 'CERRADO';
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('1')),
    err => err.status === 409 && err.message.includes('ABIERTO'),
  );
});

test('rechaza cambio si la matrícula no está ACTIVA', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  f.state.matriculas[0].estado = 'RETIRADA';
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('1')),
    err => err.status === 409 && err.message.includes('ACTIVA'),
  );
});

test('rechaza cambio si existen asistencias en la sección origen desde fecha_efectiva en adelante (Precisión 4)', async () => {
  const f = studentsFixture();
  const matricula = await prepare(f, '11');
  // Asistencia el mismo día de fecha_efectiva rechaza
  f.state.attendances.push({ matricula_id: matricula.id, fecha: '2026-05-20' });
  await assert.rejects(
    () => f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('1')),
    err => err.status === 409 && err.message.includes('existen asistencias'),
  );

  // Asistencia previa a fecha_efectiva está permitida
  f.state.attendances = [{ matricula_id: matricula.id, fecha: '2026-05-19' }];
  const ok = await f.matriculas.changeSection(matricula.id, { seccion_id: '14', fecha_efectiva: '2026-05-20' }, f.actor('1'));
  assert.equal(ok.seccion_nueva_id, '14');
});

test('controller y router configuran la ruta POST /:id/cambio-seccion para ADMIN y SUBDIRECCION', async () => {
  let calledWith = null;
  const mockService = {
    async changeSection(id, body, actor) {
      calledWith = { id, body, actor };
      return { id, ok: true };
    },
  };
  const controller = createEnrollmentController(mockService);
  const res = { json(data) { this.data = data; } };
  await controller.changeSection({ params: { id: '99' }, body: { seccion_id: '14', fecha_efectiva: '2026-05-20' }, authUser: { id: '1', rol: 'ADMIN' } }, res);
  assert.deepEqual(calledWith, { id: '99', body: { seccion_id: '14', fecha_efectiva: '2026-05-20' }, actor: { id: '1', rol: 'ADMIN' } });
  assert.deepEqual(res.data, { id: '99', ok: true });

  const routes = createEnrollmentRoutes({ authenticate: () => ({ id: '1' }) }, mockService);
  const route = routes.router.stack.find(s => s.route?.path === '/:id/cambio-seccion');
  assert.ok(route, 'Ruta /:id/cambio-seccion debe estar registrada');
  assert.equal(route.route.methods.post, true);
});
