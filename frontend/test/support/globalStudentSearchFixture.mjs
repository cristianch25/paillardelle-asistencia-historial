export function searchRows(server, fecha = server.sesion.fecha, level = 'INICIAL', missing = false) {
  return server.padron.map(row => ({ estudiante: row.estudiante, matricula_id: row.matricula_id,
    matricula_seccion_id: row.matricula_seccion_id, anio_escolar: { id: server.sesion.anio_escolar_id, anio: 2026 },
    seccion: { id: server.sesion.seccion_id, nivel: level, grado: level === 'INICIAL' ? 4 : 1, letra: level === 'INICIAL' ? 'CREATIVOS' : 'A', turno: null },
    fecha, situacion: missing ? 'SIN_SESION' : 'CON_REGISTRO', estado: missing ? null : row.estado,
    sesion_id: missing ? null : server.sesion.id, sesion_estado: missing ? null : server.sesion.estado,
    sesion_version: missing ? null : server.sesion.version, asistencia_id: missing ? null : row.asistencia_id,
    asistencia_version: missing ? null : row.version }));
}
export function searchResponse(config, rows) {
  const { fecha, q = '', page = 1, limit = 20 } = config.params;
  const normalized = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const query = q.trim().replace(/\s+/gu, ' '), terms = normalized(query).split(' ').filter(Boolean);
  const matches = rows.filter(row => terms.every(term => normalized([row.estudiante.nombres, row.estudiante.apellido_paterno,
    row.estudiante.apellido_materno, row.estudiante.codigo_estudiante].filter(Boolean).join(' ')).includes(term)));
  return { fecha, q: query, resultados: matches.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, has_more: page * limit < matches.length } };
}
