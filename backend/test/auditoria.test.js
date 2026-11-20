import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAdministrativeAuditService,
  formatAuditAction,
  formatAuditDescription,
  formatSectionLabel,
  formatStudentName,
  formatUserName,
} from '../src/modules/auditoria/service.js';
import { createAuditController } from '../src/modules/auditoria/controller.js';
import { createAuditRoutes } from '../src/modules/auditoria/routes.js';

const realAuthAdmin = {
  id: '1',
  nombres: 'Admin',
  apellidos: 'Paillardelle',
  usuario: 'admin',
  rol: 'ADMIN',
  cargo: 'Director',
  nivel_asignado: null,
  puede_escanear_qr: false,
  puede_usar_bitacora: false,
};
const subdirActor = { id: '2', usuario: 'subdir', rol: 'SUBDIRECCION', activo: 1 };
const regActor = { id: '3', usuario: 'profe', rol: 'REGISTRADOR', activo: 1 };
const inactiveAdmin = { id: '4', usuario: 'antiguo', rol: 'ADMIN', activo: 0 };

test('auditoria: admite req.authUser real (publicUser sin campo activo) y rechaza inactivo o no ADMIN', async () => {
  const service = createAdministrativeAuditService({ async list() { return []; } });
  const ok = await service.list(realAuthAdmin);
  assert.deepEqual(ok.registros, []);

  await assert.rejects(
    async () => service.list(inactiveAdmin),
    err => err.status === 401 && /inactivo/.test(err.message),
  );
  await assert.rejects(
    async () => service.list(null),
    err => err.status === 401 && /No autenticado/.test(err.message),
  );
  await assert.rejects(
    async () => service.list(subdirActor),
    err => err.status === 403 && /exclusivamente a ADMIN/.test(err.message),
  );
  await assert.rejects(
    async () => service.list(regActor),
    err => err.status === 403 && /exclusivamente a ADMIN/.test(err.message),
  );
});

test('auditoria: formato de nombres y secciones sin inventar datos', () => {
  assert.equal(formatStudentName('Pérez', 'Gómez', 'Ana'), 'Pérez Gómez, Ana');
  assert.equal(formatStudentName('Quispe', null, 'Juan'), 'Quispe, Juan');
  assert.equal(formatStudentName(null, null, null), null);

  assert.equal(formatSectionLabel(4, 'A', 'PRIMARIA'), '4.º A Primaria');
  assert.equal(formatSectionLabel(1, 'B', 'SECUNDARIA'), '1.º B Secundaria');
  assert.equal(formatSectionLabel(5, 'A', 'INICIAL'), '5 años A Inicial');
  assert.equal(formatSectionLabel(null, null, null), null);

  assert.equal(formatUserName('Carlos', 'Quispe', 'cquispe', 'REGISTRADOR'), 'Carlos Quispe (@cquispe) · REGISTRADOR');
  assert.equal(formatUserName(null, null, 'cquispe', null), 'cquispe (@cquispe)');
  assert.equal(formatUserName(null, null, null, null), null);

  assert.equal(formatAuditAction('CAMBIO_SECCION'), 'Cambiar sección');
  assert.equal(formatAuditAction('ACCION_INEDITA'), 'Accion inedita');
});

test('auditoria: descripciones comprensibles para retiro, reingreso y cambio de sección', () => {
  // 1. RETIRAR_MATRICULA con estudiante y sección histórica
  const retiroConSeccion = formatAuditDescription({
    accion: 'RETIRAR_MATRICULA', entidad: 'matriculas', registro_id: 16n,
    estudiante_nombres: 'Ana', estudiante_apellido_paterno: 'Pérez', estudiante_apellido_materno: 'Gómez',
    retiro_grado: 4, retiro_letra: 'A', retiro_nivel: 'PRIMARIA',
  });
  assert.equal(retiroConSeccion, 'Retiro de Pérez Gómez, Ana (4.º A Primaria).');

  // Retiro con estudiante pero sin sección histórica
  const retiroSinSeccion = formatAuditDescription({
    accion: 'RETIRAR_MATRICULA', entidad: 'matriculas', registro_id: 16n,
    estudiante_nombres: 'Ana', estudiante_apellido_paterno: 'Pérez', estudiante_apellido_materno: 'Gómez',
  });
  assert.equal(retiroSinSeccion, 'Retiro de Pérez Gómez, Ana (matrícula #16).');

  // Retiro huérfano (sin estudiante)
  const retiroHuerfano = formatAuditDescription({
    accion: 'RETIRAR_MATRICULA', entidad: 'matriculas', registro_id: 16n,
  });
  assert.equal(retiroHuerfano, 'Retiro de matrícula #16.');

  // 2. CAMBIO_SECCION con origen y destino
  const cambioCompleto = formatAuditDescription({
    accion: 'CAMBIO_SECCION', entidad: 'matriculas', registro_id: 16n,
    estudiante_nombres: 'Ana', estudiante_apellido_paterno: 'Pérez', estudiante_apellido_materno: 'Gómez',
    origen_grado: 4, origen_letra: 'A', origen_nivel: 'PRIMARIA',
    destino_grado: 4, destino_letra: 'B', destino_nivel: 'PRIMARIA',
  });
  assert.equal(cambioCompleto, 'Cambio de sección de Pérez Gómez, Ana: de 4.º A Primaria a 4.º B Primaria.');

  // Cambio de sección sin estudiante pero con secciones
  const cambioSinEstudiante = formatAuditDescription({
    accion: 'CAMBIO_SECCION', entidad: 'matriculas', registro_id: 16n,
    origen_grado: 4, origen_letra: 'A', origen_nivel: 'PRIMARIA',
    destino_grado: 4, destino_letra: 'B', destino_nivel: 'PRIMARIA',
  });
  assert.equal(cambioSinEstudiante, 'Cambio de sección de 4.º A Primaria a 4.º B Primaria (matrícula #16).');

  // 3. REINGRESAR_MATRICULA con destino
  const reingreso = formatAuditDescription({
    accion: 'REINGRESAR_MATRICULA', entidad: 'matriculas', registro_id: 16n,
    estudiante_nombres: 'Ana', estudiante_apellido_paterno: 'Pérez', estudiante_apellido_materno: 'Gómez',
    destino_grado: 4, destino_letra: 'B', destino_nivel: 'PRIMARIA',
  });
  assert.equal(reingreso, 'Reingreso de Pérez Gómez, Ana en 4.º B Primaria.');

  // 4. CREAR_MATRICULA con estudiante y sección
  const matricula = formatAuditDescription({
    accion: 'CREAR_MATRICULA', entidad: 'matriculas', registro_id: 16n,
    estudiante_nombres: 'Ana', estudiante_apellido_paterno: 'Pérez', estudiante_apellido_materno: 'Gómez',
    destino_grado: 1, destino_letra: 'A', destino_nivel: 'SECUNDARIA',
  });
  assert.equal(matricula, 'Nueva matrícula de Pérez Gómez, Ana en 1.º A Secundaria.');
});

test('auditoria: descripciones para cuentas, asignaciones y fallbacks seguros', () => {
  // RESTABLECER_PASSWORD
  const reset = formatAuditDescription({
    accion: 'RESTABLECER_PASSWORD', entidad: 'usuarios', registro_id: 5n,
    target_nombres: 'Carlos', target_apellidos: 'Quispe Mamani', target_usuario: 'cquispe', target_rol: 'REGISTRADOR',
  });
  assert.equal(reset, 'Restablecimiento de contraseña para Carlos Quispe Mamani (@cquispe) · REGISTRADOR.');

  // CREAR_USUARIO
  const userCreate = formatAuditDescription({
    accion: 'CREAR_USUARIO', entidad: 'usuarios', registro_id: 8n,
    target_nombres: 'Lucía', target_apellidos: 'Flores Soto', target_usuario: 'lflores', target_rol: 'REGISTRADOR',
  });
  assert.equal(userCreate, 'Creación de cuenta para Lucía Flores Soto (@lflores) · REGISTRADOR.');

  // CAMBIAR_PASSWORD
  const passChange = formatAuditDescription({
    accion: 'CAMBIAR_PASSWORD', entidad: 'usuarios', registro_id: 1n,
  });
  assert.equal(passChange, 'El usuario cambió su propia contraseña.');

  // CREAR_ASIGNACION
  const asg = formatAuditDescription({
    accion: 'CREAR_ASIGNACION', entidad: 'asignaciones', registro_id: 12n,
    asg_docente_nombres: 'Carlos', asg_docente_apellidos: 'Quispe Mamani', asg_docente_usuario: 'cquispe',
    asg_seccion_grado: 4, asg_seccion_letra: 'A', asg_seccion_nivel: 'PRIMARIA',
  });
  assert.equal(asg, 'Asignación de Carlos Quispe Mamani (@cquispe) a la sección 4.º A Primaria.');

  // FINALIZAR_ASIGNACION
  const asgEnd = formatAuditDescription({
    accion: 'FINALIZAR_ASIGNACION', entidad: 'asignaciones', registro_id: 12n,
    asg_docente_nombres: 'Carlos', asg_docente_apellidos: 'Quispe Mamani', asg_docente_usuario: 'cquispe',
    asg_seccion_grado: 4, asg_seccion_letra: 'A', asg_seccion_nivel: 'PRIMARIA',
  });
  assert.equal(asgEnd, 'Cese de asignación de Carlos Quispe Mamani (@cquispe) en 4.º A Primaria.');

  // Enmascaramiento de descripciones con datos sensibles
  const sensitive = formatAuditDescription({
    accion: 'OTRA_ACCION', entidad: 'usuarios', registro_id: 3n,
    descripcion: 'Contraseña en claro password123 hash $2b$10$...',
  });
  assert.doesNotMatch(sensitive, /password|hash|\$2b\$/i);

  // Operación sin relaciones
  const huerfano = formatAuditDescription({
    accion: 'OPERACION_DESCONOCIDA', entidad: 'otra_entidad', registro_id: 99n,
  });
  assert.equal(huerfano, 'Operacion desconocida en otra_entidad #99.');
});

test('auditoria: ADMIN lista registros y devuelve estructura enriquecida y segura', async () => {
  const mockRepo = {
    async list() {
      return [
        {
          id: 101n,
          usuario_id: 1n,
          accion: 'RETIRAR_MATRICULA',
          entidad: 'matriculas',
          registro_id: 50n,
          fecha_hora: new Date('2026-11-20T01:15:00.000Z'),
          descripcion: null,
          actor_nombres: 'Juan',
          actor_apellidos: 'Pérez',
          actor_usuario: 'jperez',
          actor_rol: 'ADMIN',
          estudiante_nombres: 'Ana',
          estudiante_apellido_paterno: 'Pérez',
          estudiante_apellido_materno: 'Gómez',
          retiro_grado: 4,
          retiro_letra: 'A',
          retiro_nivel: 'PRIMARIA',
        },
      ];
    },
  };
  const service = createAdministrativeAuditService(mockRepo);
  const result = await service.list(realAuthAdmin, { page: '1', limit: '20' });

  assert.equal(result.registros.length, 1);
  const [first] = result.registros;
  assert.equal(first.id, '101');
  assert.equal(first.accion, 'RETIRAR_MATRICULA');
  assert.equal(first.accion_nombre, 'Retirar matrícula');
  assert.equal(first.descripcion, 'Retiro de Pérez Gómez, Ana (4.º A Primaria).');
  assert.equal(first.usuario.nombre_completo, 'Juan Pérez');

  // Comprobación de que no se exponen JSON ni contraseñas
  assert.equal(first.datos_anteriores, undefined);
  assert.equal(first.datos_nuevos, undefined);
  assert.equal(first.password, undefined);
  assert.equal(first.password_hash, undefined);
});

test('auditoria: controller y router configuran GET / protegido con requireAdmin', () => {
  let capturedUser = null, capturedQuery = null;
  const fakeService = {
    async list(user, query) {
      capturedUser = user;
      capturedQuery = query;
      return { registros: [], pagination: { page: 1, limit: 20, has_more: false } };
    },
  };
  const controller = createAuditController(fakeService);
  const req = { authUser: realAuthAdmin, query: { page: '1' } };
  let jsonResponse = null;
  const res = { json(data) { jsonResponse = data; } };
  controller.list(req, res);
  assert.equal(capturedUser.usuario, 'admin');
  assert.equal(capturedQuery.page, '1');

  const authService = { authenticate: () => {} };
  const router = createAuditRoutes(authService, fakeService);
  assert.equal(typeof router, 'function');
  const getRoute = router.stack.find(layer => layer.route && layer.route.methods.get);
  assert.ok(getRoute, 'Debe registrar ruta GET');
  assert.equal(getRoute.route.path, '/');
});

test('auditoria: app.js monta /api/auditoria', async () => {
  const { createApp } = await import('../src/app.js');
  const app = createApp({
    authService: { authenticate: () => {} },
    auditService: { list: async () => ({ registros: [], pagination: {} }) },
  });
  const mounted = (app.router?.stack || app._router?.stack || []).some(
    l => typeof l.match === 'function' && l.match('/api/auditoria'),
  );
  assert.ok(mounted, 'La ruta /api/auditoria debe estar registrada en app.js');
});
