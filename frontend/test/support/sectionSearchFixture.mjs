export const catalogYear = { id: '1', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' };
export function sectionCatalog(total = 230, yearId = '1') {
  return Array.from({ length: total }, (_, index) => ({ id: String(9007199254740995n + BigInt(index)), anio_escolar_id: yearId,
    nivel: index % 2 ? 'SECUNDARIA' : 'PRIMARIA', grado: index % 5 + 1, letra: `GRUPO ${index + 1}`,
    activo: index % 2 === 0, turno: null,
    ...({ 0: { nivel: 'PRIMARIA', grado: 1, letra: 'A' }, 1: { nivel: 'SECUNDARIA', grado: 1, letra: 'A' },
      2: { nivel: 'INICIAL', grado: 4, letra: 'CREATIVOS' }, 3: { nivel: 'INICIAL', grado: 5, letra: 'GENIALES' },
      4: { nivel: 'PRIMARIA', grado: 1, letra: 'B' }, 150: { nivel: 'PRIMARIA', grado: 5, letra: 'E', activo: false } }[index] ?? {}),
  }));
}
export function catalogResponse(config, rows = sectionCatalog()) {
  const { page, limit } = config.params, start = (Number(page) - 1) * Number(limit);
  return { config, data: { secciones: rows.slice(start, start + Number(limit)),
    pagination: { page: Number(page), limit: Number(limit), has_more: start + Number(limit) < rows.length } },
  status: 200, statusText: 'OK', headers: {} };
}
