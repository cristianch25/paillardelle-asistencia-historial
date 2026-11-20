import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createAttendanceHistoryService } from '../src/modules/asistencias/history.service.js';

function mockRepository({ actor, context, history = [], connection = {} }) {
  return {
    async read(actorId, work) {
      return work(connection, actor ?? { id: actorId, rol: 'ADMIN', activo: 1 });
    },
    async findContext(_connection, id) {
      if (context && context.asistencia_id === id) return context;
      return null;
    },
    async findHistory(_connection, id) {
      return history.filter(h => h.asistencia_id === id);
    },
  };
}

const sampleContextPrimaria = {
  asistencia_id: '100',
  sesion_id: '10',
  fecha: '2026-05-15',
  estado_actual: 'TARDANZA',
  justificada_actual: true,
  motivo_justificacion_actual: 'Cita médica comprobada',
  version_actual: 2,
  seccion: { id: '1', nivel: 'PRIMARIA', grado: 5, letra: 'A', turno: 'MAÑANA' },
  estudiante: {
    id: '50',
    codigo_estudiante: 'EST123',
    nombres: 'Carlos',
    apellido_paterno: 'Mamani',
    apellido_materno: 'Quispe',
  },
};

const sampleContextSecundaria = {
  ...sampleContextPrimaria,
  asistencia_id: '200',
  seccion: { id: '2', nivel: 'SECUNDARIA', grado: 3, letra: 'B', turno: 'TARDE' },
};

const sampleContextInicial = {
  ...sampleContextPrimaria,
  asistencia_id: '300',
  seccion: { id: '3', nivel: 'INICIAL', grado: 5, letra: 'U', turno: 'MAÑANA' },
};

const sampleHistory = [
  {
    id: '1',
    asistencia_id: '100',
    tipo: 'PRIMERA_MARCA',
    estado_anterior: 'PENDIENTE',
    estado_nuevo: 'FALTA',
    justificada_anterior: false,
    justificada_nueva: false,
    motivo: null,
    motivo_justificacion_anterior: null,
    motivo_justificacion_nuevo: null,
    version_anterior: 0,
    version_nueva: 1,
    posterior_cierre: false,
    fecha_modificacion: '2026-05-15T13:00:00.000Z',
    modificado_por: { id: '2', usuario: 'docente1', nombres: 'Ana', apellidos: 'Pérez', rol: 'REGISTRADOR' },
  },
  {
    id: '2',
    asistencia_id: '100',
    tipo: 'JUSTIFICACION',
    estado_anterior: 'FALTA',
    estado_nuevo: 'TARDANZA',
    justificada_anterior: false,
    justificada_nueva: true,
    motivo: 'Corrección con constancia',
    motivo_justificacion_anterior: null,
    motivo_justificacion_nuevo: 'Cita médica comprobada',
    version_anterior: 1,
    version_nueva: 2,
    posterior_cierre: true,
    fecha_modificacion: '2026-05-15T14:30:00.000Z',
    modificado_por: { id: '1', usuario: 'admin', nombres: 'Director', apellidos: 'Paillardelle', rol: 'ADMIN' },
  },
];

test('historial asistencias service: validaciones de entrada y autenticación', async () => {
  const service = createAttendanceHistoryService({
    repository: mockRepository({ context: sampleContextPrimaria }),
  });

  await assert.rejects(
    async () => service.history('abc', { id: '1' }),
    err => err.status === 400 && /ID inválido/.test(err.message),
  );
  await assert.rejects(
    async () => service.history('0', { id: '1' }),
    err => err.status === 400,
  );
  await assert.rejects(
    async () => service.history('100', null),
    err => err.status === 401 && /Autenticación requerida/.test(err.message),
  );
});

test('historial asistencias service: permisos V8 por rol', async () => {
  // REGISTRADOR -> 403
  const regService = createAttendanceHistoryService({
    repository: mockRepository({
      actor: { id: '3', rol: 'REGISTRADOR', activo: 1 },
      context: sampleContextPrimaria,
    }),
  });
  await assert.rejects(
    async () => regService.history('100', { id: '3' }),
    err => err.status === 403 && /REGISTRADOR no tiene acceso/.test(err.message),
  );

  // Inactivo -> 401
  const inactiveService = createAttendanceHistoryService({
    repository: mockRepository({
      actor: { id: '1', rol: 'ADMIN', activo: 0 },
      context: sampleContextPrimaria,
    }),
  });
  await assert.rejects(
    async () => inactiveService.history('100', { id: '1' }),
    err => err.status === 401 && /inactivo/.test(err.message),
  );

  // No existente -> 404
  const adminService = createAttendanceHistoryService({
    repository: mockRepository({
      actor: { id: '1', rol: 'ADMIN', activo: 1 },
      context: sampleContextPrimaria,
      history: sampleHistory,
    }),
  });
  await assert.rejects(
    async () => adminService.history('999', { id: '1' }),
    err => err.status === 404 && /no encontrado/.test(err.message),
  );

  // ADMIN -> éxito global
  const result = await adminService.history('100', { id: '1' });
  assert.equal(result.asistencia_id, '100');
  assert.equal(result.cambios.length, 2);
  assert.equal(result.cambios[0].tipo, 'PRIMERA_MARCA');
  assert.equal(result.cambios[1].tipo, 'JUSTIFICACION');
});

const ambitos = [
  ['Primaria propia', 'PRIMARIA', [], sampleContextPrimaria, true],
  ['Inicial propio', 'INICIAL', [], sampleContextInicial, true],
  ['Secundaria propia', 'SECUNDARIA', [], sampleContextSecundaria, true],
  ['Primaria sin Inicial adicional', 'PRIMARIA', [], sampleContextInicial, false],
  ['Primaria con Inicial adicional', 'PRIMARIA', ['INICIAL'], sampleContextInicial, true],
  ['Secundaria con Primaria adicional', 'SECUNDARIA', ['PRIMARIA'], sampleContextPrimaria, true],
  ['Primaria sin Secundaria adicional', 'PRIMARIA', ['INICIAL'], sampleContextSecundaria, false],
  ['Secundaria sin Primaria adicional', 'SECUNDARIA', [], sampleContextPrimaria, false],
  ['Sin nivel principal válido', null, ['INICIAL'], sampleContextInicial, false],
];

for (const [nombre, principal, adicionales, context, permitido] of ambitos) {
  test(`historial técnico V8: ${nombre}`, async () => {
    const actor = { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: principal };
    let consultasPermisos = 0, consultasHistorial = 0;
    const connection = {
      async execute(sql, params) {
        consultasPermisos++;
        assert.match(sql, /FROM usuario_niveles_adicionales/);
        assert.doesNotMatch(sql, /FOR UPDATE/);
        assert.deepEqual(params, [actor.id]);
        return [adicionales.map(nivel => ({ nivel }))];
      },
    };
    const repository = mockRepository({ actor, context, connection });
    repository.findHistory = async actualConnection => {
      assert.equal(actualConnection, connection);
      consultasHistorial++;
      return sampleHistory;
    };
    const service = createAttendanceHistoryService({ repository });
    // El rol y nivel enviados no sustituyen al actor revalidado por el repositorio.
    const solicitante = { id: actor.id, rol: 'ADMIN', nivel_asignado: 'INICIAL' };
    if (permitido) {
      const result = await service.history(context.asistencia_id, solicitante);
      assert.equal(result.asistencia_id, context.asistencia_id);
      assert.deepEqual(result.cambios, sampleHistory);
    } else {
      await assert.rejects(service.history(context.asistencia_id, solicitante),
        error => error.status === 403);
    }
    assert.equal(consultasPermisos, 1);
    assert.equal(consultasHistorial, permitido ? 1 : 0);
  });
}

test('historial técnico: ADMIN global sin consultar permisos adicionales', async () => {
  for (const context of [sampleContextPrimaria, sampleContextInicial, sampleContextSecundaria]) {
    const service = createAttendanceHistoryService({ repository: mockRepository({ context }) });
    assert.equal((await service.history(context.asistencia_id, { id: '1' })).asistencia_id,
      context.asistencia_id);
  }
});

test('historial técnico: retirar un adicional impide la siguiente consulta', async () => {
  let adicionales = [{ nivel: 'INICIAL' }];
  const service = createAttendanceHistoryService({ repository: mockRepository({
    actor: { id: '2', rol: 'SUBDIRECCION', activo: 1, nivel_asignado: 'PRIMARIA' },
    context: sampleContextInicial,
    connection: { async execute() { return [adicionales]; } },
  }) });
  await service.history('300', { id: '2' });
  adicionales = [];
  await assert.rejects(service.history('300', { id: '2' }), error => error.status === 403);
});

test('historial asistencias: controller y router configuran GET /:asistenciaId/historial', async () => {
  let capturedId = null, capturedUser = null;
  const fakeService = {
    async history(id, actor) {
      capturedId = id;
      capturedUser = actor;
      return { asistencia_id: id, cambios: [] };
    },
  };
  const { createAttendanceController } = await import('../src/modules/asistencias/controller.js');
  const controller = createAttendanceController(fakeService);
  const req = { params: { asistenciaId: '100' }, authUser: { id: '1', rol: 'ADMIN' } };
  let jsonResponse = null;
  const res = { json(data) { jsonResponse = data; } };

  await controller.history(req, res);
  assert.equal(capturedId, '100');
  assert.equal(capturedUser.rol, 'ADMIN');
  assert.equal(jsonResponse.asistencia_id, '100');

  const { createAttendanceRoutes } = await import('../src/modules/asistencias/routes.js');
  const authService = { authenticate: () => {} };
  const router = createAttendanceRoutes(authService, fakeService);
  const historyLayer = router.stack.find(
    l => l.route && l.route.path === '/:asistenciaId/historial' && l.route.methods.get,
  );
  assert.ok(historyLayer, 'Debe registrar GET /:asistenciaId/historial');

  const app = createApp({
    authService,
    attendanceService: fakeService,
  });
  const mounted = (app.router?.stack || app._router?.stack || []).some(
    l => typeof l.match === 'function' && l.match('/api/asistencias'),
  );
  assert.ok(mounted, 'La ruta /api/asistencias debe estar montada en app.js');
});
