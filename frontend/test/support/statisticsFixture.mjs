export const statisticsYear = { id: '9007199254741100', anio: 2026, fecha_inicio: '2026-03-02', fecha_fin: '2026-12-18', estado: 'CERRADO' };
export const statisticsFilters = { anio_escolar_id: statisticsYear.id, fecha_desde: '2026-11-01', fecha_hasta: '2026-11-30' };
export function statisticsResponse(filters = statisticsFilters) {
  return { filtros: { ...filters, nivel: filters.nivel ?? null }, niveles_autorizados: ['INICIAL', 'PRIMARIA', 'SECUNDARIA'],
    totales: { presentes: 6, tardanzas: 2, faltas: 2, pendientes: 7 }, marcas_registradas: 10, sesiones_con_registro: 3 };
}
