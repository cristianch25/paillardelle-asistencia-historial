export function monthlyFollowupResponse(query, total = 21, levels = ['INICIAL', 'PRIMARIA', 'SECUNDARIA']) {
  const inicio = query.anio_escolar_id === '2' ? '2025-03-03' : '2026-03-02';
  const fin = query.anio_escolar_id === '2' ? '2025-12-19' : '2026-12-18';
  const [year, month] = query.mes.split('-').map(Number);
  const first = `${query.mes}-01`, last = `${query.mes}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  const offset = (query.page - 1) * query.limit;
  return { filtros: { anio_escolar_id: query.anio_escolar_id, mes: query.mes, nivel: query.nivel ?? null,
    fecha_desde: first < inicio ? inicio : first, fecha_hasta: last > fin ? fin : last }, niveles_autorizados: [...levels],
  estudiantes: Array.from({ length: Math.min(query.limit, Math.max(0, total - offset)) }, (_, i) => ({
    estudiante: { id: String(9007199254740993n + BigInt(offset + i)), apellido_paterno: 'Prueba', apellido_materno: null, nombres: `Estudiante ${offset + i + 1}` },
    secciones: ['1', '2'].map(id => ({ id, nivel: query.nivel ?? levels[0], grado: (query.nivel ?? levels[0]) === 'INICIAL' ? 4 : 1, letra: id === '1' ? 'A' : 'B' })),
    faltas: 2, tardanzas: 1, total: 3, justificadas: 2, injustificadas: 1,
  })), pagination: { page: query.page, limit: query.limit, total, has_more: query.page * query.limit < total } };
}
