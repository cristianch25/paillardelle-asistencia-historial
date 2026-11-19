import { formatCivilDate } from '../../shared/dates/civilDate';
import type { SectionAttendanceStatus } from './sectionAttendanceSummaries.api';

const indicators = [['presentes', 'Presentes'], ['tardanzas', 'Tardanzas'], ['faltas', 'Faltas'],
  ['pendientes', 'Sin marcar'], ['total', 'Total de estudiantes']] as const;
const tones = { presentes: 'text-emerald-800', tardanzas: 'text-amber-800', faltas: 'text-rose-800', pendientes: 'text-slate-600', total: '' };

export default function SectionAttendanceSummary({ date, summary, compact = false }: { date: string; summary?: SectionAttendanceStatus; compact?: boolean }) {
  const item = summary?.status === 'ready' ? summary.item : null;
  return <section aria-label="Asistencia de hoy" className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-sm">
    {!compact && <p className="font-medium text-slate-600">Asistencia del {formatCivilDate(date)}</p>}
    {!summary || summary.status === 'loading' ? <p role="status">Cargando resumen…</p>
      : summary.status === 'outside-year' ? <p className="text-slate-600">La fecha actual está fuera del intervalo de este año escolar.</p>
      : summary.status === 'error' ? <p className="text-slate-600">Resumen no disponible. No se pudo comprobar la asistencia.</p>
      : <>
        {!compact && !item!.es_lectivo && <p className="font-medium text-slate-600">Fecha no lectiva.</p>}
        {item!.resumen ? <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3">
          {indicators.filter(([key]) => !compact || key !== 'total').map(([key, label]) => <div key={key} className={`min-w-0 ${key === 'total' ? 'col-span-2 flex justify-between border-t border-slate-200 pt-2' : ''}`}>
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className={compact ? `mt-1 text-3xl font-bold tabular-nums ${tones[key]}`
              : 'font-semibold tabular-nums text-institutional-950'}>{item!.resumen![key]}</dd>
          </div>)}
        </dl> : <p className="text-slate-600">Asistencia aún no registrada.</p>}
      </>}
  </section>;
}
