import type { AttendanceDetail } from '../asistencias/asistencias.types';
import type { SupervisionSection } from '../asistencias/supervision/supervision.types';
import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';

type Counts = AttendanceDetail['resumen'];
export type DailyLevel = { nivel: EducationLevel; sections: number; registered: number; unregistered: number; lective: boolean | null; counts: Counts | null };
export type DailySummary = { levels: DailyLevel[]; sections: number; registered: number; unregistered: number; counts: Counts | null };
const levels: EducationLevel[] = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];
const keys = ['total', 'presentes', 'tardanzas', 'faltas', 'pendientes'] as const;
const emptyCounts = (): Counts => ({ total: 0, presentes: 0, tardanzas: 0, faltas: 0, pendientes: 0 });
const inconsistent = () => { throw new Error('El resumen recibido es inconsistente.'); };

function addCounts(target: Counts | null, source: Counts): Counts {
  if (keys.some(key => !Number.isSafeInteger(source[key]) || source[key] < 0)
    || source.total !== source.presentes + source.tardanzas + source.faltas + source.pendientes) inconsistent();
  const result = target ?? emptyCounts();
  for (const key of keys) {
    result[key] += source[key];
    if (!Number.isSafeInteger(result[key])) inconsistent();
  }
  return result;
}

export function summarizeDay(rows: SupervisionSection[], yearId: string): DailySummary {
  const result: DailySummary = { sections: rows.length, registered: 0, unregistered: 0, counts: null,
    levels: levels.map(nivel => ({ nivel, sections: 0, registered: 0, unregistered: 0, lective: null, counts: null })) };
  const sections = new Set<string>(), sessions = new Set<string>();
  for (const row of rows) {
    const level = result.levels.find(item => item.nivel === row.seccion?.nivel);
    if (!level || row.seccion.anio_escolar_id !== yearId || typeof row.seccion.id !== 'string' || !/^[1-9]\d*$/.test(row.seccion.id)
      || sections.has(row.seccion.id) || typeof row.es_lectivo !== 'boolean') inconsistent();
    // Una discrepancia entre páginas impide presentar un día lectivo inventado.
    if (level!.lective !== null && level!.lective !== row.es_lectivo) inconsistent();
    level!.lective = row.es_lectivo; level!.sections++; sections.add(row.seccion.id);
    if (row.situacion === 'SIN_REGISTRO') {
      if (row.sesion_id !== null || row.resumen !== null) inconsistent();
      level!.unregistered++; result.unregistered++;
    } else {
      if (!['ABIERTA', 'CERRADA'].includes(row.situacion) || typeof row.sesion_id !== 'string'
        || !/^[1-9]\d*$/.test(row.sesion_id) || sessions.has(row.sesion_id) || !row.resumen) inconsistent();
      sessions.add(row.sesion_id!); level!.registered++; result.registered++;
      level!.counts = addCounts(level!.counts, row.resumen!);
      result.counts = addCounts(result.counts, row.resumen!);
    }
  }
  return result;
}
