import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdministrativeAuditRepository } from '../src/modules/auditoria/repository.js';
import { createAdministrativeAuditService, formatAuditAction, formatAuditDescription } from '../src/modules/auditoria/service.js';

const grupos = [
  ['ABRIR_SESION_ASISTENCIA', 'ABRIR_SESION', 'Creación de sesión de asistencia',
    'Se creó la sesión para registrar la asistencia del día.'],
  ['CERRAR_SESION_ASISTENCIA', 'CERRAR_SESION', 'Cierre de sesión de asistencia',
    'Se cerró la sesión de asistencia. Este cierre no impide las correcciones autorizadas.'],
];

function preparar() {
  const registros = grupos.flatMap(([actual, antiguo]) => [actual, antiguo]).map((accion, index) => ({
    id: String(index + 1), usuario_id: '1', accion, entidad: 'sesiones_asistencia', registro_id: '50',
    fecha_hora: '2026-11-20 12:00:00', actor_nombres: 'Directora', actor_apellidos: 'Prueba',
    actor_usuario: 'admin_ficticio', actor_rol: 'ADMIN', descripcion: null,
  }));
  const consultas = [];
  const connection = { async execute(sql, params) {
    assert.match(sql.trim(), /^SELECT/);
    assert.match(sql, /ORDER BY fecha_orden DESC, id DESC, origen DESC LIMIT \? OFFSET \?/);
    consultas.push({ sql, params });
    const acciones = params.slice(0, -2);
    const filas = acciones.length ? registros.filter(row => acciones.includes(row.accion)) : registros;
    const [limit, offset] = params.slice(-2);
    return [filas.slice(offset, offset + limit)];
  } };
  const repository = createAdministrativeAuditRepository(() => connection);
  return { registros, consultas, service: createAdministrativeAuditService(repository) };
}

for (const [actual, antiguo, etiqueta, descripcion] of grupos) {
  test(`etiquetas de sesiones: ${actual} y ${antiguo}`, () => {
    for (const accion of [actual, antiguo]) {
      assert.equal(formatAuditAction(accion), etiqueta);
      assert.equal(formatAuditDescription({ accion, entidad: 'sesiones_asistencia', registro_id: '50' }), descripcion);
    }
  });
}

test('categoria Asistencias: apertura/cierre actuales e historicos con paginacion global', async () => {
  const { registros, consultas, service } = preparar(), before = structuredClone(registros);
  const first = await service.list({ id: '1', rol: 'ADMIN' }, { categoria: 'ASISTENCIAS', page: '1', limit: '2' });
  const second = await service.list({ id: '1', rol: 'ADMIN' }, { categoria: 'ASISTENCIAS', page: '2', limit: '2' });
  assert.deepEqual([...first.registros, ...second.registros].map(row => row.accion), grupos.flatMap(([a, b]) => [a, b]));
  assert.equal(first.pagination.has_more, true); assert.equal(second.pagination.has_more, false);
  for (const [index, query] of consultas.entries()) {
    assert.match(query.sql, /a.entidad = \? AND a.accion IN/);
    assert.deepEqual(query.params, ['sesiones_asistencia', 'ABRIR_SESION_ASISTENCIA', 'ABRIR_SESION', 'CERRAR_SESION_ASISTENCIA', 'CERRAR_SESION', 3, index * 2]);
  }
  assert.deepEqual(registros, before);
});

test('categorias siguen reservadas a ADMIN', async () => {
  const { service, consultas } = preparar();
  for (const rol of ['SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) {
    await assert.rejects(service.list({ id: '2', rol, activo: 1 }, { categoria: 'ASISTENCIAS' }), { status: 403 });
  }
  assert.equal(consultas.length, 0);
});
