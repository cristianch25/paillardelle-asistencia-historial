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
    assert.match(sql, /ORDER BY a.fecha_hora DESC, a.id DESC/);
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
  test(`auditoría: etiquetas y descripciones comprensibles para ${actual} y su código antiguo`, () => {
    for (const accion of [actual, antiguo]) {
      assert.equal(formatAuditAction(accion), etiqueta);
      const texto = formatAuditDescription({ accion, entidad: 'sesiones_asistencia', registro_id: '50' });
      assert.equal(texto, descripcion);
      assert.doesNotMatch(texto, /ABRIR_SESION|CERRAR_SESION|sesiones_asistencia/);
    }
  });

  for (const accion of [actual, antiguo]) {
    test(`auditoría: filtro ${accion} incluye ambos formatos y conserva paginación e históricos`, async () => {
      const { registros, consultas, service } = preparar();
      const antes = structuredClone(registros);
      const actor = { id: '1', rol: 'ADMIN', activo: 1 };
      const primera = await service.list(actor, { accion, page: '1', limit: '1' });
      const segunda = await service.list(actor, { accion, page: '2', limit: '1' });
      assert.deepEqual(primera.pagination, { page: 1, limit: 1, has_more: true });
      assert.deepEqual(segunda.pagination, { page: 2, limit: 1, has_more: false });
      assert.deepEqual([...primera.registros, ...segunda.registros].map(row => row.accion), [actual, antiguo]);
      for (const row of [...primera.registros, ...segunda.registros]) {
        assert.equal(row.accion_nombre, etiqueta);
        assert.equal(row.descripcion, descripcion);
      }
      assert.equal(consultas.length, 2);
      for (const [index, consulta] of consultas.entries()) {
        assert.match(consulta.sql, /WHERE a.accion IN \(\?, \?\)/);
        assert.deepEqual(consulta.params, [actual, antiguo, 2, index]);
      }
      assert.deepEqual(registros, antes);
    });
  }
}

test('auditoría: Todas las operaciones no añade un filtro y conserva ambos tipos de eventos', async () => {
  const { service, consultas } = preparar();
  const result = await service.list({ id: '1', rol: 'ADMIN' }, { accion: '', page: '1', limit: '20' });
  assert.deepEqual(result.registros.map(row => row.accion), grupos.flatMap(([actual, antiguo]) => [actual, antiguo]));
  assert.deepEqual(result.pagination, { page: 1, limit: 20, has_more: false });
  assert.doesNotMatch(consultas[0].sql, /WHERE a.accion/);
  assert.deepEqual(consultas[0].params, [21, 0]);
});

test('auditoría: los filtros de sesiones siguen reservados a ADMIN', async () => {
  const { service, consultas } = preparar();
  for (const rol of ['SUBDIRECCION', 'REGISTRADOR']) {
    await assert.rejects(service.list({ id: '2', rol, activo: 1 }, { accion: grupos[0][0] }), { status: 403 });
  }
  assert.equal(consultas.length, 0);
});
