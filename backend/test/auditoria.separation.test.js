import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { activityFeedQuery } from '../src/modules/auditoria/activity-feed.query.js';
import { securityEventSql } from '../src/modules/auditoria/security-classification.js';
import { createAdministrativeAuditRepository } from '../src/modules/auditoria/repository.js';
import { createAdministrativeAuditService } from '../src/modules/auditoria/service.js';
import { createSecurityRepository } from '../src/modules/seguridad/repository.js';
import { createSecurityService } from '../src/modules/seguridad/service.js';
import { createSecurityRoutes } from '../src/modules/seguridad/routes.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { operationalCategories } from '../src/modules/auditoria/operational-categories.js';

test('Seguridad: lista cerrada de cuentas y permisos, sin filtro por rol actual ni histórico', () => {
  const sql = securityEventSql();
  for (const action of ['CREAR_SUPERUSUARIO_LOCAL', 'CAMBIAR_PASSWORD', 'RESTABLECER_PASSWORD', 'CREAR_USUARIO', 'ACTUALIZAR_USUARIO', 'CAMBIAR_ESTADO_USUARIO', 'ACTUALIZAR_NIVELES_ADICIONALES']) assert.ok(sql.includes(action));
  assert.match(sql, /entidad = 'usuarios'/);
  assert.match(sql, /entidad = 'usuario_niveles_adicionales'/);
  assert.doesNotMatch(sql, /\.rol|actor_rol|target_rol|JOIN|LOGIN|SINCRONIZ|estudiantes|matriculas|asistencias/);
});

test('paginación global: una sola UNION ALL, LIMIT/OFFSET después de la unión y desempate entre orígenes', async () => {
  const fixture = [
    { id: '9007199254740993', origen: 'asistencia', fecha_hora: '2026-11-22 13:00:00.123456', accion: 'CAMBIO_ASISTENCIA', usuario_id: '7',
      registro_id: '8', asistencia_fecha: '2026-11-13', asistencia_estudiante_id: '9', asistencia_nombres: 'Estudiante ficticio',
      asistencia_seccion_id: '10', asistencia_nivel: 'PRIMARIA', asistencia_grado: 1, asistencia_letra: 'A',
      estado_anterior: 'PENDIENTE', estado_nuevo: 'TARDANZA', justificada_nueva: true,
      motivo_justificacion_nuevo: 'Aviso ficticio', motivo: null, tipo: 'PRIMERA_MARCA' },
    { id: '9007199254740993', origen: 'administrativa', fecha_hora: '2026-11-22 13:00:00.123456', accion: 'CREAR_SECCION', usuario_id: '7', registro_id: '10' },
    { id: '2', origen: 'asistencia', fecha_hora: '2026-11-21 12:00:00', accion: 'CAMBIO_ASISTENCIA', usuario_id: '7', registro_id: '8' },
  ];
  const queries = [], pool = { async execute(sql, params) {
    assert.equal((sql.match(/UNION ALL/g) ?? []).length, 1);
    assert.equal((sql.match(/LIMIT \? OFFSET \?/g) ?? []).length, 1);
    assert.ok(sql.indexOf('UNION ALL') < sql.indexOf('LIMIT ? OFFSET ?'));
    assert.match(sql, /ORDER BY fecha_orden DESC, id DESC, origen DESC LIMIT/);
    assert.match(sql, /a.entidad = \? AND a.accion IN/);
    assert.doesNotMatch(sql, /SELECT \*|INSERT|UPDATE|DELETE/);
    queries.push({ sql, params }); const [limit, offset] = params.slice(-2);
    return [structuredClone(fixture.slice(offset, offset + limit))];
  } };
  const service = createAdministrativeAuditService(createAdministrativeAuditRepository(() => pool));
  const first = await service.list({ id: '7', rol: 'ADMIN' }, { page: '1', limit: '2' });
  const second = await service.list({ id: '7', rol: 'ADMIN' }, { page: '2', limit: '2' });
  assert.deepEqual(queries.map(q => q.params.slice(-2)), [[3, 0], [3, 2]]);
  const combined = [...first.registros, ...second.registros];
  assert.equal(new Set(combined.map(r => `${r.origen}:${r.id}`)).size, 3);
  assert.equal(first.pagination.has_more, true); assert.equal(second.pagination.has_more, false);
  assert.equal(first.registros[0].fecha_hora, '2026-11-22T13:00:00.123Z');
  assert.equal(first.registros[0].asistencia.fecha, '2026-11-13');
  assert.equal(first.registros[0].asistencia.motivo_justificacion_nuevo, 'Aviso ficticio');
  for (const rol of ['SUPERUSUARIO', 'SUBDIRECCION', 'REGISTRADOR']) await assert.rejects(service.list({ id: '7', rol }), { status: 403 });
  assert.equal(queries.length, 2);
});

test('categorias invalidas y filtro anterior: rechazo sin consultar registros', async () => {
  let calls = 0;
  const service = createAdministrativeAuditService({ list: async () => { calls++; return []; } });
  for (const categoria of ["desconocida' OR 1=1", ['ASISTENCIAS'], {}, '__proto__', 'CAMBIAR_PASSWORD']) {
    assert.throws(() => activityFeedQuery({ categoria, limit: 21, offset: 0 }), { status: 400 });
    await assert.rejects(service.list({ rol: 'ADMIN' }, { categoria }), { status: 400 });
  }
  await assert.rejects(service.list({ rol: 'ADMIN' }, { accion: 'CAMBIAR_PASSWORD' }), { status: 400 });
  assert.equal(calls, 0);
});

test('Seguridad conserva su clasificación y consulta solo columnas seguras', async () => {
  const repository = createSecurityRepository(() => ({ async execute(sql, params) {
    assert.ok(sql.includes(`WHERE ${securityEventSql()}`));
    assert.match(sql, /ORDER BY a.fecha_hora DESC, a.id DESC LIMIT \? OFFSET \?/);
    assert.deepEqual(params, [21, 0]);
    assert.doesNotMatch(sql, /password_hash|SELECT \*|a\.descripcion|a\.datos_nuevos,/);
    return [[]];
  } }));
  assert.deepEqual(await repository.list({ limit: 21, offset: 0 }), []);
});

test('cuatro categorías y Todas: solo eventos escolares; paginación conjunta sin pérdidas ni escrituras', async () => {
  let id = 0;
  const academic = Object.entries(operationalCategories).flatMap(([categoria, groups]) => groups.flatMap(([entidad, actions]) => actions.map(accion => ({
    id: String(++id), origen: 'administrativa', categoria, entidad, accion, fecha_hora: '2026-11-22 13:00:00',
  }))));
  const technical = ['CREAR_USUARIO', 'ACTUALIZAR_USUARIO', 'CAMBIAR_ESTADO_USUARIO', 'CAMBIAR_PASSWORD', 'RESTABLECER_PASSWORD',
    'CREAR_SUPERUSUARIO_LOCAL', 'ACTIVIDAD_DESCONOCIDA', 'ACTUALIZAR_TELEFONO_APODERADO', 'CREAR_APODERADO_IMPORTACION']
    .map(accion => ({ id: String(++id), origen: 'administrativa', entidad: 'usuarios', accion, fecha_hora: '2026-11-23 13:00:00' }));
  technical.push({ ...technical[0], accion: 'CREAR_SECCION' }); // Acción válida en una entidad ajena: rechazar también.
  technical.push({ ...technical[0], entidad: 'usuario_niveles_adicionales', accion: 'ACTUALIZAR_NIVELES_ADICIONALES' });
  const history = ['PRIMERA_MARCA', 'CAMBIO', 'JUSTIFICACION', 'ANULACION', 'REACTIVACION'].map((tipo, index) => ({
    id: String(index + 1), origen: 'asistencia', categoria: 'ASISTENCIAS', tipo, fecha_hora: '2026-11-22 13:00:00',
  }));
  const storage = [...academic, ...technical, ...history], before = structuredClone(storage);
  const repository = createAdministrativeAuditRepository(() => ({ async execute(sql, params) {
    assert.match(sql.trim(), /^SELECT/); assert.equal((sql.match(/LIMIT \? OFFSET \?/g) ?? []).length, 1);
    let position = 0;
    const clauses = Array.from(sql.matchAll(/\(a\.entidad = \? AND a\.accion IN \(([?, ]+)\)\)/g)).map(match => {
      const entity = params[position++], count = (match[1].match(/\?/g) ?? []).length;
      const actions = params.slice(position, position + count); position += count;
      return { entity, actions };
    });
    const rows = storage.filter(row => row.origen === 'asistencia'
      ? !sql.includes('FROM historial_asistencias h WHERE 1 = 0')
      : clauses.some(clause => clause.entity === row.entidad && clause.actions.includes(row.accion)));
    rows.sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora) || (BigInt(a.id) < BigInt(b.id) ? 1 : BigInt(a.id) > BigInt(b.id) ? -1 : b.origen.localeCompare(a.origen)));
    const [limit, offset] = params.slice(position); return [rows.slice(offset, offset + limit)];
  } }));
  for (const categoria of ['', ...Object.keys(operationalCategories)]) {
    const expected = [...academic, ...history].filter(row => !categoria || row.categoria === categoria);
    const received = [];
    for (let offset = 0; offset < expected.length; offset += 3) received.push(...await repository.list({ categoria, offset, limit: 3 }));
    assert.equal(received.length, expected.length);
    assert.deepEqual(new Set(received.map(row => `${row.origen}:${row.id}`)), new Set(expected.map(row => `${row.origen}:${row.id}`)));
    assert.ok(received.every(row => !technical.includes(row)));
  }
  assert.deepEqual(storage, before);
});

test('Seguridad: cuentas de todos los roles y permisos registrados, con paginación y sin datos académicos ni secretos', async () => {
  let id = 0;
  const rows = ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO'].flatMap(rol =>
    ['CREAR_USUARIO', 'ACTUALIZAR_USUARIO', 'CAMBIAR_ESTADO_USUARIO', 'CAMBIAR_PASSWORD', 'RESTABLECER_PASSWORD'].map((accion, index) => ({
      id: String(++id), accion, entidad: 'usuarios', fecha_hora: '2026-11-22 13:00:00', usuario_id: '50', registro_id: String(id + 100),
      actor_nombres: 'Responsable ficticio', target_usuario: `cuenta_${rol}_${index}`, activo_nuevo: rol === 'ADMIN' ? '1' : '0',
      datos_nuevos: { rol, password: 'NO_EXPONER' }, password_hash: 'NO_EXPONER',
    })));
  rows.push({ ...rows[0], id: String(++id), accion: 'ACTUALIZAR_NIVELES_ADICIONALES', entidad: 'usuario_niveles_adicionales', target_usuario: 'subdireccion_ficticia' });
  rows.push({ ...rows[0], id: String(++id), accion: 'CREAR_SUPERUSUARIO_LOCAL' });
  const expected = rows.length;
  for (const [entidad, accion] of [['estudiantes', 'ACTUALIZAR_USUARIO'], ['asignaciones', 'CREAR_ASIGNACION'],
    ['matriculas', 'CREAR_MATRICULA'], ['usuarios', 'LOGIN'], ['usuarios', 'ACCESO_DENEGADO']]) {
    rows.push({ ...rows[0], id: String(++id), entidad, accion, target_usuario: 'NO_MOSTRAR' });
  }
  const before = structuredClone(rows), queries = [];
  const service = createSecurityService(createSecurityRepository(() => ({ async execute(sql, params) {
    assert.match(sql.trim(), /^SELECT/); assert.doesNotMatch(sql, /target\.rol|actor\.rol|\$\.rol/);
    assert.match(sql, /LEFT JOIN usuarios target ON target.id = a.registro_id/);
    const actions = new Set(Array.from(sql.match(/a\.accion IN \(([\s\S]*?)\)/)[1].matchAll(/'([^']+)'/g), match => match[1]));
    const selected = rows.filter(row => (row.entidad === 'usuarios' && actions.has(row.accion))
      || (row.entidad === 'usuario_niveles_adicionales' && row.accion === 'ACTUALIZAR_NIVELES_ADICIONALES'));
    selected.sort((a, b) => Number(b.id) - Number(a.id));
    queries.push(params); const [limit, offset] = params; return [structuredClone(selected.slice(offset, offset + limit))];
  } })));
  const events = [];
  for (let page = 1; ; page++) {
    const result = await service.list({ id: '50', rol: 'SUPERUSUARIO' }, { page: String(page), limit: '3' });
    events.push(...result.registros);
    if (!result.pagination.has_more) break;
  }
  assert.equal(events.length, expected); assert.equal(new Set(events.map(row => row.id)).size, expected);
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR', 'SUPERUSUARIO']) {
    assert.equal(events.filter(row => row.cuenta.nombre.startsWith(`cuenta_${rol}_`) && row.evento !== 'Alta local de SUPERUSUARIO').length, 5);
  }
  assert.ok(events.some(row => row.evento === 'Usuario actualizado'));
  assert.ok(events.some(row => row.evento === 'Permisos de usuario actualizados' && row.cuenta.nombre === 'subdireccion_ficticia'));
  assert.ok(events.some(row => row.evento === 'Cuenta activada')); assert.ok(events.some(row => row.evento === 'Cuenta desactivada'));
  assert.doesNotMatch(JSON.stringify(events), /NO_EXPONER|NO_MOSTRAR|password_hash|datos_nuevos|niveles_adicionales/);
  assert.deepEqual(queries[0], [4, 0]); assert.deepEqual(queries[1], [4, 3]);
  assert.deepEqual(rows, before);
});

test('Seguridad: servicio exclusivo, proyección mínima y origen local no atribuido falsamente a usuario web', async () => {
  let calls = 0;
  const actions = ['CREAR_SUPERUSUARIO_LOCAL', 'CREAR_USUARIO', 'CAMBIAR_ESTADO_USUARIO', 'CAMBIAR_ESTADO_USUARIO', 'RESTABLECER_PASSWORD', 'CAMBIAR_PASSWORD'];
  const service = createSecurityService({ async list() { calls++; return actions.map((accion, i) => ({ id: i + 1, accion,
    fecha_hora: '2026-11-22 13:00:00', usuario_id: 2, registro_id: 3, actor_nombres: 'Responsable ficticio',
    target_usuario: 'cuenta_ficticia', activo_nuevo: i === 2 ? 'true' : '0', password_hash: 'NO_EXPONER', datos_nuevos: { token: 'NO_EXPONER' } })); } });
  for (const rol of ['ADMIN', 'SUBDIRECCION', 'REGISTRADOR']) await assert.rejects(service.list({ id: '2', rol }), { status: 403 });
  await assert.rejects(service.list(null), { status: 401 });
  await assert.rejects(service.list({ rol: 'SUPERUSUARIO', activo: 0 }), { status: 401 });
  await assert.rejects(service.list({ rol: 'SUPERUSUARIO' }, { accion: 'cualquiera' }), { status: 400 });
  assert.equal(calls, 0);
  const result = await service.list({ id: '2', rol: 'SUPERUSUARIO' });
  assert.equal(result.registros[0].responsable.id, null);
  assert.match(result.registros[0].responsable.nombre, /Herramienta local/);
  assert.match(result.registros[2].evento, /activada/); assert.match(result.registros[3].evento, /desactivada/);
  assert.equal(result.registros[4].cuenta.nombre, 'cuenta_ficticia');
  assert.doesNotMatch(JSON.stringify(result), /NO_EXPONER|password_hash|datos_nuevos|token/);
});

test('GET /api/seguridad: autenticación y rol comprobados incluso si se inyecta un servicio sin autorización', async () => {
  let calls = 0;
  const app = express();
  app.use('/api/seguridad', createSecurityRoutes({ authenticate: async rol => ({ id: '2', rol }) },
    { list: async () => { calls++; return { registros: [] }; } })); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/seguridad`;
  try {
    for (const [rol, status] of [[null, 401], ['ADMIN', 403], ['SUBDIRECCION', 403], ['REGISTRADOR', 403], ['SUPERUSUARIO', 200]]) {
      const response = await fetch(url, { headers: rol ? { Authorization: `Bearer ${rol}` } : {} });
      assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(calls, 1);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer SUPERUSUARIO' } })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
