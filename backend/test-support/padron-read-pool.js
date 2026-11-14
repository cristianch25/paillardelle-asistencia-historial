export function readEnrollmentRows(sql, params, state) {
  const date = params[0];
  const inDate = (start, end) => start <= date && (end === null || end >= date);
  let index = 6;
  const filters = {};
  for (const key of ['estudiante_id', 'anio_escolar_id', 'seccion_id']) {
    if (sql.includes(`${key === 'seccion_id' ? 'ms' : 'm'}.${key} = ?`)) filters[key] = params[index++];
  }
  const scoped = {};
  for (const [column, key] of [['s.nivel', 'levels'], ['s.id', 'ids']]) {
    const match = sql.match(new RegExp(`${column.replace('.', '\\.')} IN \\(([^)]+)\\)`));
    if (match) { const count = match[1].split(',').length; scoped[key] = params.slice(index, index + count); index += count; }
  }
  let rows = state.links.flatMap(link => {
    const m = state.matriculas.find(row => row.id === link.matricula_id);
    const s = state.sections.get(link.seccion_id), year = state.years.get(m?.anio_escolar_id);
    if (!m || !s || !year || sql.includes('1 = 0') || !inDate(m.fecha_ingreso, m.fecha_retiro)
      || !inDate(link.fecha_inicio, link.fecha_fin) || !inDate(year.fecha_inicio, year.fecha_fin)
      || (filters.estudiante_id && filters.estudiante_id !== m.estudiante_id)
      || (filters.anio_escolar_id && filters.anio_escolar_id !== m.anio_escolar_id)
      || (filters.seccion_id && filters.seccion_id !== link.seccion_id)
      || (scoped.levels && !scoped.levels.includes(s.nivel)) || (scoped.ids && !scoped.ids.includes(s.id))) return [];
    return [{ ...m, matricula_seccion_id: link.id, seccion_id: link.seccion_id,
      fecha_inicio: link.fecha_inicio, fecha_fin: link.fecha_fin }];
  });
  if (sql.includes('SELECT DISTINCT')) rows = [...new Set(rows.map(row => row.estudiante_id))].map(estudiante_id => ({ estudiante_id }));
  const key = sql.includes('SELECT DISTINCT') ? 'estudiante_id' : 'id';
  rows.sort((a, b) => BigInt(a[key]) < BigInt(b[key]) ? -1 : 1);
  return sql.includes('LIMIT ?') ? rows.slice(params[index + 1], params[index + 1] + params[index]) : rows;
}
