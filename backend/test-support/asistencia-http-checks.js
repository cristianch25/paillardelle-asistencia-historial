import assert from 'node:assert/strict';

export async function checkAttendanceHttp(request, tokens, pool, faults, destroyed) {
  const admin = tokens.admin, registrar = tokens['reg-ini'];
  const open = (section, date, token = admin) => request('/asistencias/sesiones', token, null, { seccion_id: section, fecha: date });
  const concurrent = await Promise.all([open('1', '2026-11-13'), open('1', '2026-11-13', registrar)]);
  assert.deepEqual(concurrent.map(row => row.status).sort(), [200, 201]);
  assert.equal(concurrent[0].data.sesion.id, concurrent[1].data.sesion.id);
  let current = concurrent[0].data;
  const id = current.sesion.id, path = `/asistencias/sesiones/${id}`;
  const rowId = current.padron[0].asistencia_id;
  assert.equal(current.resumen.pendientes, 5); assert.ok(current.padron.every(row => row.version === 0));
  await request(path, null, 401);
  for (const key of ['reg-pri', 'reg-sec', 'sub-sec']) await request(path, tokens[key], 404);
  await request(path, tokens['sub-pri'], 200);
  await request('/calendario-lectivo/excepciones/1/INICIAL/2026-11-13', admin, 409,
    { es_lectivo: false, descripcion: 'Sesión todavía sin marcas' }, 'PUT');
  for (const date of ['2026-11-14', '2026-11-16', '2026-10-30']) assert.equal((await open('1', date)).status, 409);
  await request('/asistencias/sesiones', admin, 400, { seccion_id: '1', fecha: '2026-02-30' });
  const save = (body, status = 200, token = registrar) => request(`${path}/registros`, token, status, body, 'PATCH');
  const patch = (estado, motivo) => ({ version: current.sesion.version, cambios: [
    { asistencia_id: rowId, version: current.padron[0].version, estado, ...(motivo ? { motivo } : {}) }] });
  await save(patch('PRESENTE'), 404, tokens['reg-pri']);
  const simultaneous = await Promise.all([save(patch('PRESENTE'), null), save(patch('PRESENTE'), null, admin)]);
  assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 409]);
  current = simultaneous.find(result => result.status === 200).data;
  const [[firstMark]] = await pool.query('SELECT registrado_por, primera_marca_en FROM asistencias WHERE id=?', [rowId]);
  assert.deepEqual(current.resumen, { total: 5, presentes: 1, tardanzas: 0, faltas: 0, pendientes: 4 });
  assert.ok(current.padron[0].ultimo_cambio); assert.ok(!JSON.stringify(current).includes('estado_anterior'));
  const [[histBefore]] = await pool.query('SELECT COUNT(*) AS total FROM historial_asistencias');
  await save(patch('PRESENTE'));
  const [[histAfter]] = await pool.query('SELECT COUNT(*) AS total FROM historial_asistencias');
  assert.equal(histBefore.total, histAfter.total);
  await save({ ...patch('TARDANZA'), version: 1 }, 409);
  await save({ version: current.sesion.version, cambios: [{ asistencia_id: '999999', version: 0, estado: 'FALTA' }] }, 409);
  faults.history = true; await save(patch('TARDANZA'), 500); faults.history = false;
  assert.equal((await request(path, admin, 200)).data.padron[0].estado, 'PRESENTE');
  faults.audit = true; await request(`${path}/cierre`, admin, 500, { version: current.sesion.version }); faults.audit = false;
  assert.equal((await request(path, admin, 200)).data.sesion.estado, 'ABIERTA');
  current = (await request(`${path}/cierre`, registrar, 200, { version: current.sesion.version })).data;
  assert.equal(current.advertencias[0].cantidad, 4);
  await save(patch('FALTA'), 400);
  current = (await save(patch('FALTA', 'Corrección ficticia después del cierre'))).data;
  assert.equal(current.sesion.estado, 'CERRADA');
  current = (await save(patch('PENDIENTE', 'Anulación ficticia'))).data;
  assert.equal(current.resumen.pendientes, 5);
  current = (await save(patch('TARDANZA', 'Reactivación ficticia'))).data;
  assert.equal(current.padron[0].asistencia_id, rowId);
  assert.equal((await request(`${path}/resumen`, admin, 200)).data.resumen.tardanzas, 1);
  const [[events]] = await pool.query('SELECT COUNT(*) AS total FROM historial_asistencias WHERE asistencia_id=?', [rowId]);
  assert.equal(Number(events.total), current.padron[0].version);
  const [[first]] = await pool.query('SELECT registrado_por, primera_marca_en FROM asistencias WHERE id=?', [rowId]);
  assert.ok(first.primera_marca_en); assert.deepEqual(first, firstMark);
  await request('/calendario-lectivo/excepciones/1/INICIAL/2026-11-13', admin, 409,
    { es_lectivo: false, descripcion: 'Bloqueo ficticio rechazado' }, 'PUT');
  await request('/matriculas/alta-inicial', admin, 409, { anio_escolar_id: '1', seccion_id: '1', fecha_ingreso: '2026-11-02',
    estudiante: { codigo_estudiante: 'PRUEBA-RECHAZADA-004', apellido_paterno: 'Ficticio', nombres: 'No persistir' } });
  const [[student]] = await pool.query("SELECT COUNT(*) AS total FROM estudiantes WHERE codigo_estudiante='PRUEBA-RECHAZADA-004'");
  assert.equal(Number(student.total), 0);
  // COMMIT aplicado por MySQL pero respuesta perdida: no reintentar; consultar el resultado.
  faults.commit = true; await save(patch('PRESENTE', 'Prueba ficticia de COMMIT incierto'), 500); faults.commit = false;
  const recovered = (await request(path, admin, 200)).data;
  assert.equal(recovered.padron[0].estado, 'PRESENTE'); assert.equal(destroyed(), 1);
  const [history] = await pool.query('SELECT tipo, posterior_cierre, motivo FROM historial_asistencias WHERE asistencia_id=? ORDER BY version_nueva', [rowId]);
  assert.deepEqual(history.slice(0, 4).map(row => row.tipo), ['PRIMERA_MARCA', 'CAMBIO', 'ANULACION', 'REACTIVACION']);
  assert.ok(history.slice(1).every(row => row.posterior_cierre === 1 && row.motivo));
  const secondary = await open('3', '2026-11-13'); assert.equal(secondary.status, 201);
  await request(`/asistencias/sesiones/${secondary.data.sesion.id}`, tokens['sub-pri'], 404);
  await request(`/asistencias/sesiones/${secondary.data.sesion.id}`, tokens['sub-sec'], 200);
  // Vigente hoy pero no en la fecha de asistencia: tampoco concede consulta/modificación.
  await pool.execute("UPDATE asignaciones SET fecha_inicio='2026-11-14' WHERE usuario_id=?", [tokens.registrarId]);
  try { await request(path, registrar, 404); }
  finally { await pool.execute("UPDATE asignaciones SET fecha_inicio='2026-11-02' WHERE usuario_id=?", [tokens.registrarId]); }
  await pool.execute("UPDATE anios_escolares SET estado='CERRADO' WHERE id=1");
  try {
    await request(path, admin, 200);
    assert.equal((await open('1', '2026-11-13')).status, 200);
    await save({ version: recovered.sesion.version, cambios: [{ asistencia_id: rowId, version: recovered.padron[0].version, estado: 'FALTA', motivo: 'No permitido' }] }, 409);
  } finally { await pool.execute("UPDATE anios_escolares SET estado='ABIERTO' WHERE id=1"); }
  await request('/calendario-lectivo/excepciones/1/INICIAL/2026-11-14', admin, 200,
    { es_lectivo: true, descripcion: 'Recuperación ficticia de sábado' }, 'PUT');
  assert.equal((await open('1', '2026-11-14')).status, 201);
  const emptySection = await request('/secciones', admin, 201,
    { anio_escolar_id: '1', nivel: 'INICIAL', grado: 5, letra: 'GENIALES' });
  assert.equal((await open(emptySection.data.seccion.id, '2026-11-13')).status, 409);
  return { sessionId: id, rowId, secondary: secondary.data.sesion.id };
}
