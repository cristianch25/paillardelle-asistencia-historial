import { operationalCategories, readAuditCategory } from './operational-categories.js';

export function activityFeedQuery({ limit, offset, categoria }) {
  const category = readAuditCategory(categoria), params = [];
  const groups = category ? operationalCategories[category] : Object.values(operationalCategories).flat();
  const administrative = groups.map(([entity, actions]) => {
    params.push(entity, ...actions);
    return `(a.entidad = ? AND a.accion IN (${actions.map(() => '?').join(', ')}))`;
  }).join(' OR ');
  const attendance = !category || category === 'ASISTENCIAS' ? '' : ' WHERE 1 = 0';
  params.push(limit, offset);
  return { params, sql: `(
    SELECT 'administrativa' AS origen, a.id, a.fecha_hora AS fecha_orden
    FROM auditoria_administrativa a WHERE (${administrative})
    UNION ALL
    SELECT 'asistencia' AS origen, h.id, h.fecha_modificacion AS fecha_orden
    FROM historial_asistencias h${attendance}
    ORDER BY fecha_orden DESC, id DESC, origen DESC LIMIT ? OFFSET ?
  )` };
}
