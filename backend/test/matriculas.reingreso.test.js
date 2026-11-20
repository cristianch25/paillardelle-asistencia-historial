import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEnrollmentController } from '../src/modules/matriculas/controller.js';
import { createEnrollmentRoutes } from '../src/modules/matriculas/routes.js';
import { studentsFixture, identity, enrollment } from '../test-support/estudiantes-pool.js';

async function prepareRetired(f, seccion_id = '11', fecha_retiro = '2026-06-15') {
  f.state.years.get('1').estado = 'ABIERTO';
  f.state.sections.set('14', { id: '14', anio_escolar_id: '1', nivel: 'PRIMARIA', grado: 4, letra: 'B', activo: 1, turno: null });
  const result = await f.matriculas.createJoint(
    { ...enrollment, seccion_id, estudiante: identity, fecha_ingreso: '2026-03-01' },
    f.actor('1'),
  );
  await f.matriculas.withdraw(result.matricula.id, { fecha_retiro, fecha_retiro_esperada: null }, f.actor('1'));
  return result.matricula;
}

test('retiredList devuelve los estudiantes retirados cuyo último vínculo fue esa sección', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');

  const resAdmin = await f.matriculas.retiredList('11', f.actor('1'));
  assert.equal(resAdmin.retirados.length, 1);
  assert.equal(resAdmin.retirados[0].id, matricula.id);
  assert.equal(resAdmin.retirados[0].estado, 'RETIRADA');
  assert.equal(resAdmin.retirados[0].fecha_retiro, '2026-06-15');

  // SUBDIRECCION autorizada en PRIMARIA (actor '2')
  const resSub = await f.matriculas.retiredList('11', f.actor('2'));
  assert.equal(resSub.retirados.length, 1);

  // SUBDIRECCION no autorizada en PRIMARIA (actor '3', SECUNDARIA)
  await assert.rejects(
    () => f.matriculas.retiredList('11', f.actor('3')),
    err => err.status === 404,
  );

  // REGISTRADOR rechazado
  await assert.rejects(
    () => f.matriculas.retiredList('11', f.actor('4')),
    err => err.status === 403,
  );
});

test('reingreso exitoso por ADMIN: reactiva matrícula, limpia fecha_retiro, crea nuevo vínculo y audita', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');

  const result = await f.matriculas.reingreso(
    matricula.id,
    { seccion_id: '11', fecha_reingreso: '2026-08-11' },
    f.actor('1'),
  );
  assert.equal(result.id, matricula.id);
  assert.equal(result.estado, 'ACTIVA');
  assert.equal(result.seccion_id, '11');
  assert.equal(result.fecha_reingreso, '2026-08-11');

  // Matrícula reactivada y fecha_retiro en null
  assert.equal(f.state.matriculas[0].estado, 'ACTIVA');
  assert.equal(f.state.matriculas[0].fecha_retiro, null);

  // Vínculo anterior intacto
  assert.equal(f.state.links[0].fecha_fin, '2026-06-15');

  // Nuevo vínculo activo
  assert.equal(f.state.links[1].seccion_id, '11');
  assert.equal(f.state.links[1].fecha_inicio, '2026-08-11');
  assert.equal(f.state.links[1].fecha_fin, null);

  // Auditoría
  const audit = f.state.audits.find(a => a.accion === 'REINGRESAR_MATRICULA');
  assert.ok(audit);
  assert.equal(audit.entidad, 'matriculas');
  assert.equal(audit.registro_id, matricula.id);
  assert.equal(audit.despues.estado, 'ACTIVA');
  assert.equal(audit.despues.fecha_retiro, null);
  assert.equal(audit.despues.fecha_reingreso, '2026-08-11');
});

test('padrón por fecha: alumno NO figura durante el retiro y figura desde la fecha de reingreso', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  await f.matriculas.reingreso(matricula.id, { seccion_id: '11', fecha_reingreso: '2026-08-11' }, f.actor('1'));

  // 1. Antes del retiro (2026-06-15): figura en padrón de sección 11
  const padronAntes = await f.matriculas.padron('11', { fecha: '2026-06-15' }, f.actor('1'));
  assert.equal(padronAntes.padron.length, 1);
  assert.equal(padronAntes.padron[0].id, matricula.id);

  // 2. Durante el período de retiro (2026-07-15): NO figura en padrón
  const padronDurante = await f.matriculas.padron('11', { fecha: '2026-07-15' }, f.actor('1'));
  assert.equal(padronDurante.padron.length, 0);

  // 3. Día previo al reingreso (2026-08-10): NO figura en padrón
  const padronDiaPrevio = await f.matriculas.padron('11', { fecha: '2026-08-10' }, f.actor('1'));
  assert.equal(padronDiaPrevio.padron.length, 0);

  // 4. Desde fecha de reingreso (2026-08-11): figura en padrón
  const padronDesde = await f.matriculas.padron('11', { fecha: '2026-08-11' }, f.actor('1'));
  assert.equal(padronDesde.padron.length, 1);
  assert.equal(padronDesde.padron[0].id, matricula.id);
});

test('listado de retirados ya no incluye al estudiante tras su reingreso', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  const antes = await f.matriculas.retiredList('11', f.actor('1'));
  assert.equal(antes.retirados.length, 1);

  await f.matriculas.reingreso(matricula.id, { seccion_id: '11', fecha_reingreso: '2026-08-11' }, f.actor('1'));
  const despues = await f.matriculas.retiredList('11', f.actor('1'));
  assert.equal(despues.retirados.length, 0);
});

test('reingreso a sección paralela del mismo nivel y grado', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  // Reingreso a '14' (4 B Primaria)
  const result = await f.matriculas.reingreso(matricula.id, { seccion_id: '14', fecha_reingreso: '2026-08-11' }, f.actor('1'));
  assert.equal(result.seccion_id, '14');

  const padronDestino = await f.matriculas.padron('14', { fecha: '2026-08-11' }, f.actor('1'));
  assert.equal(padronDestino.padron.length, 1);
  assert.equal(padronDestino.padron[0].id, matricula.id);

  const padronOrigen = await f.matriculas.padron('11', { fecha: '2026-08-11' }, f.actor('1'));
  assert.equal(padronOrigen.padron.length, 0);
});

test('rechaza reingreso a sección de distinto nivel o grado', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  // Distinto nivel ('12' es SECUNDARIA 4 A)
  await assert.rejects(
    () => f.matriculas.reingreso(matricula.id, { seccion_id: '12', fecha_reingreso: '2026-08-11' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('mismo nivel y grado'),
  );
});

test('rechaza reingreso con fecha futura', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  await assert.rejects(
    () => f.matriculas.reingreso(matricula.id, { seccion_id: '11', fecha_reingreso: '2026-11-14' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('futura'),
  );
});

test('rechaza reingreso con fecha anterior o igual al retiro', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  await assert.rejects(
    () => f.matriculas.reingreso(matricula.id, { seccion_id: '11', fecha_reingreso: '2026-06-15' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('posterior'),
  );
  await assert.rejects(
    () => f.matriculas.reingreso(matricula.id, { seccion_id: '11', fecha_reingreso: '2026-05-10' }, f.actor('1')),
    err => err.status === 400 && err.message.includes('posterior'),
  );
});

test('rechaza reingreso si el año escolar no está ABIERTO', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  f.state.years.get('1').estado = 'CERRADO';
  await assert.rejects(
    () => f.matriculas.reingreso(matricula.id, { seccion_id: '11', fecha_reingreso: '2026-08-11' }, f.actor('1')),
    err => err.status === 409 && err.message.includes('ABIERTO'),
  );
});

test('rechaza reingreso si la matrícula no está RETIRADA', async () => {
  const f = studentsFixture();
  f.state.years.get('1').estado = 'ABIERTO';
  const result = await f.matriculas.createJoint(
    { ...enrollment, seccion_id: '11', estudiante: identity, fecha_ingreso: '2026-03-01' },
    f.actor('1'),
  );
  await assert.rejects(
    () => f.matriculas.reingreso(result.matricula.id, { seccion_id: '11', fecha_reingreso: '2026-08-11' }, f.actor('1')),
    err => err.status === 409 && err.message.includes('RETIRADA'),
  );
});

test('rechaza reingreso si existen asistencias incompatibles (>= fecha_reingreso)', async () => {
  const f = studentsFixture();
  const matricula = await prepareRetired(f, '11', '2026-06-15');
  f.state.attendances.push({ matricula_id: matricula.id, fecha: '2026-08-11' });
  await assert.rejects(
    () => f.matriculas.reingreso(matricula.id, { seccion_id: '11', fecha_reingreso: '2026-08-11' }, f.actor('1')),
    err => err.status === 409 && err.message.includes('existen asistencias'),
  );
});

test('controller y router configuran rutas POST /:id/reingreso y GET /:id/retirados', async () => {
  let calledWith = null;
  const mockService = {
    async reingreso(id, body, actor) {
      calledWith = { id, body, actor };
      return { id, ok: true };
    },
    async retiredList(id, actor) {
      return { seccion_id: id, retirados: [] };
    },
  };
  const controller = createEnrollmentController(mockService);
  const res = { json(data) { this.data = data; } };
  await controller.reingreso({ params: { id: '99' }, body: { seccion_id: '11', fecha_reingreso: '2026-08-11' }, authUser: { id: '1', rol: 'ADMIN' } }, res);
  assert.deepEqual(calledWith, { id: '99', body: { seccion_id: '11', fecha_reingreso: '2026-08-11' }, actor: { id: '1', rol: 'ADMIN' } });

  const routes = createEnrollmentRoutes({ authenticate: () => ({ id: '1' }) }, mockService);
  const routePost = routes.router.stack.find(s => s.route?.path === '/:id/reingreso');
  assert.ok(routePost, 'Ruta /:id/reingreso debe estar registrada');
  assert.equal(routePost.route.methods.post, true);

  const routeGet = routes.padron.stack.find(s => s.route?.path === '/:id/retirados');
  assert.ok(routeGet, 'Ruta /:id/retirados debe estar registrada');
  assert.equal(routeGet.route.methods.get, true);
});
