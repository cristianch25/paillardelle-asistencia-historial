export const dailyYear = { id: '9007199254741100', anio: 2026, fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', estado: 'ABIERTO' };
export const countsA = { total: 10, presentes: 6, tardanzas: 1, faltas: 2, pendientes: 1 };
export const countsB = { total: 8, presentes: 3, tardanzas: 2, faltas: 1, pendientes: 2 };
export function dailyRows(count = 3, fecha = '2026-11-17') {
  const withSessions = fecha === '2026-11-17';
  return Array.from({ length: count }, (_, index) => {
    const nivel = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'][index % 3], registered = withSessions && index < 2;
    return { seccion: { id: String(9007199254741200n + BigInt(index)), anio_escolar_id: dailyYear.id, nivel,
      grado: nivel === 'INICIAL' ? 4 : 1, letra: `GRUPO ${index + 1}`, turno: null, activo: index !== 1 },
    es_lectivo: fecha === '2026-11-17' ? nivel !== 'SECUNDARIA' : fecha !== '2026-11-14',
    situacion: registered ? index === 0 ? 'ABIERTA' : 'CERRADA' : 'SIN_REGISTRO',
    sesion_id: registered ? String(9007199254742200n + BigInt(index)) : null,
    resumen: registered ? { ...(index === 0 ? countsA : countsB) } : null };
  });
}
