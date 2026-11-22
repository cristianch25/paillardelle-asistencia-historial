import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarAuditDescription } from '../src/modules/auditoria/calendar-description.js';
import { createAdministrativeAuditRepository } from '../src/modules/auditoria/repository.js';
import { createAdministrativeAuditService, formatAuditDescription } from '../src/modules/auditoria/service.js';

const exception = { entidad: 'calendario_lectivo', accion: 'CREAR_EXCEPCION_LECTIVA', cal_nivel_despues: 'INICIAL',
  cal_fecha_despues: '2026-11-25', cal_lectivo_despues: 'false', cal_descripcion_despues: 'Suspensión de clases' };
const period = { entidad: 'periodos_lectivos', accion: 'CREAR_PERIODO_LECTIVO', cal_nivel_despues: 'PRIMARIA',
  cal_inicio_despues: '2026-03-02', cal_fin_despues: '2026-12-18' };

test('excepciones por tres niveles: detalle propio sin agrupar eventos coincidentes', async () => {
  const levels = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'], before = structuredClone(exception);
  const rows = levels.map((level, index) => ({ ...exception, id: String(3 - index), usuario_id: '7', registro_id: String(30 - index),
    fecha_hora: '2026-11-22 13:00:00', actor_nombres: 'Directora ficticia', cal_nivel_despues: level }));
  const repository = createAdministrativeAuditRepository(() => ({ async execute(sql, params) {
    assert.match(sql, /a.datos_nuevos->>'\$\.nivel' AS cal_nivel_despues/);
    assert.match(sql, /a.datos_anteriores->>'\$\.fecha_inicio' AS cal_inicio_antes/);
    assert.doesNotMatch(sql, /GROUP BY|JOIN calendario_lectivo|JOIN periodos_lectivos/);
    assert.equal((sql.match(/LIMIT \? OFFSET \?/g) ?? []).length, 1);
    assert.deepEqual(params.slice(-2), [3, 0]); return [structuredClone(rows)];
  } }));
  const data = await createAdministrativeAuditService(repository).list({ id: '7', rol: 'ADMIN' }, { categoria: 'CALENDARIO_ESCOLAR', limit: '2' });
  assert.equal(data.registros.length, 2); assert.equal(data.pagination.has_more, true);
  assert.deepEqual(data.registros.map(row => row.registro_id), ['30', '29']);
  assert.match(data.registros[0].descripcion, /^Inicial · 25\/11\/2026 · No lectivo · Suspensión/);
  assert.match(data.registros[1].descripcion, /^Primaria · 25\/11\/2026 · No lectivo/);
  assert.match(formatAuditDescription(rows[2]), /^Secundaria · 25\/11\/2026 · No lectivo/);
  assert.doesNotMatch(JSON.stringify(data), /cal_nivel|datos_nuevos|datos_anteriores/);
  assert.deepEqual(exception, before);
});

test('excepción actualizada: fechas, estado y descripción anteriores/nuevos exactos', () => {
  const row = { ...exception, accion: 'ACTUALIZAR_EXCEPCION_LECTIVA', cal_nivel_antes: 'INICIAL',
    cal_fecha_antes: '2026-11-25', cal_lectivo_antes: '0', cal_descripcion_antes: 'Bloqueo anterior',
    cal_lectivo_despues: '1', cal_descripcion_despues: 'Recuperación' };
  assert.equal(formatAuditDescription(row), 'Inicial · 25/11/2026 · No lectivo · Bloqueo anterior → Inicial · 25/11/2026 · Lectivo · Recuperación');
  assert.equal(formatAuditDescription({ ...exception, cal_descripcion_despues: null }), 'Inicial · 25/11/2026 · No lectivo');
});

test('períodos: rango histórico y modificación, sin inferir fechas ni zonas horarias', () => {
  assert.equal(formatAuditDescription(period), 'Primaria · del 02/03/2026 al 18/12/2026');
  assert.equal(formatAuditDescription({ ...period, accion: 'ACTUALIZAR_PERIODO_LECTIVO', cal_nivel_antes: 'PRIMARIA',
    cal_inicio_antes: '2026-03-02', cal_fin_antes: '2026-12-17' }),
  'Primaria · del 02/03/2026 al 17/12/2026 → Primaria · del 02/03/2026 al 18/12/2026');
});

test('históricos incompletos: mensajes neutros y ningún supuesto para booleanos, fechas o niveles inválidos', () => {
  assert.equal(formatAuditDescription({ entidad: 'calendario_lectivo', accion: 'CREAR_EXCEPCION_LECTIVA' }), 'Detalle histórico de la excepción no disponible.');
  assert.equal(formatAuditDescription({ entidad: 'periodos_lectivos', accion: 'CREAR_PERIODO_LECTIVO' }), 'Detalle histórico del período no disponible.');
  for (const cal_lectivo_despues of [null, undefined, 'null', 'desconocido']) {
    const text = formatAuditDescription({ ...exception, cal_lectivo_despues, cal_descripcion_despues: null });
    assert.match(text, /Información histórica incompleta/); assert.doesNotMatch(text, /No lectivo|· Lectivo/);
  }
  const partial = formatAuditDescription({ ...period, cal_nivel_despues: 'constructor', cal_fin_despues: '2026-02-30' });
  assert.equal(partial, 'Inicio: 02/03/2026 · Información histórica incompleta');
  assert.match(formatAuditDescription({ ...exception, accion: 'ACTUALIZAR_EXCEPCION_LECTIVA' }), /^Información anterior no disponible → Inicial/);
});

test('otros eventos permanecen intactos aunque contengan campos de calendario', () => {
  assert.equal(calendarAuditDescription({ ...exception, entidad: 'usuarios' }), null);
  assert.equal(formatAuditDescription({ ...exception, entidad: 'secciones', accion: 'CREAR_SECCION', registro_id: '8' }), 'Creación de sección académica #8.');
});
