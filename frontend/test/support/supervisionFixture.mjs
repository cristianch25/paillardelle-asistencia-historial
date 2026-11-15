export const year = { id: '9007199254740993', anio: 2026, estado: 'CERRADO', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' };
export function supervisionResult(params) {
  const page = Number(params.page ?? 1);
  const id = params.seccion_id || (page === 1 ? '9007199254740995' : '9007199254740996');
  return { anio_escolar_id: params.anio_escolar_id, fecha: params.fecha,
    secciones: [{ seccion: { id, anio_escolar_id: params.anio_escolar_id, nivel: params.nivel || 'INICIAL',
      grado: 4, letra: page === 1 ? 'CREATIVOS' : 'GENIALES', turno: null, activo: false },
    es_lectivo: false, situacion: 'SIN_REGISTRO', sesion_id: null, resumen: null }],
    pagination: { page, limit: Number(params.limit ?? 20), has_more: !params.seccion_id && page === 1 } };
}

export function supervisionCards(params) {
  const base = supervisionResult(params).secciones[0];
  return [
    { ...base, situacion: 'ABIERTA', es_lectivo: true, sesion_id: '9007199254741995',
      resumen: { total: 30, presentes: 24, tardanzas: 2, faltas: 1, pendientes: 3 } },
    { ...base, seccion: { ...base.seccion, id: '9007199254740996', letra: 'GENIALES' },
      situacion: 'CERRADA', es_lectivo: false, sesion_id: '9007199254741996',
      resumen: { total: 32, presentes: 28, tardanzas: 1, faltas: 3, pendientes: 0 } },
    { ...base, seccion: { ...base.seccion, id: '9007199254740997', letra: 'EXPLORADORES' } },
  ];
}
