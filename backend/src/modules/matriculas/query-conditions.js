const from = `FROM matriculas m JOIN matricula_secciones ms ON ms.matricula_id = m.id
  AND ms.anio_escolar_id = m.anio_escolar_id JOIN secciones s ON s.id = ms.seccion_id
  AND s.anio_escolar_id = m.anio_escolar_id
  JOIN anios_escolares y ON y.id = m.anio_escolar_id`;

export function enrollmentConditions(filters, access, date, joins = '') {
  const clauses = ['m.fecha_ingreso <= ?', '(m.fecha_retiro IS NULL OR m.fecha_retiro >= ?)',
    'ms.fecha_inicio <= ?', '(ms.fecha_fin IS NULL OR ms.fecha_fin >= ?)',
    'y.fecha_inicio <= ?', 'y.fecha_fin >= ?'];
  const params = [date, date, date, date, date, date];
  for (const key of ['estudiante_id', 'anio_escolar_id', 'seccion_id']) {
    if (filters[key] !== undefined) {
      clauses.push(`${key === 'seccion_id' ? 'ms' : 'm'}.${key} = ?`); params.push(filters[key]);
    }
  }
  for (const [key, column] of [['levels', 's.nivel'], ['ids', 's.id']]) {
    if (access[key] !== undefined) {
      clauses.push(access[key].length ? `${column} IN (${access[key].map(() => '?').join(', ')})` : '1 = 0');
      params.push(...access[key]);
    }
  }
  return { sql: `${from}${joins ? ` ${joins}` : ''} WHERE ${clauses.join(' AND ')}`, params };
}
