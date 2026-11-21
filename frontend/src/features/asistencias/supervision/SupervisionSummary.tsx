import type { AttendanceDetail } from '../asistencias.types';

const counts = [
  { key: 'faltas', label: 'Faltas', style: 'bg-red-50 text-red-900' },
  { key: 'tardanzas', label: 'Tardanzas', style: 'bg-amber-50 text-amber-950' },
  { key: 'pendientes', label: 'Pendientes', style: 'bg-sky-50 text-sky-900' },
  { key: 'presentes', label: 'Presentes', style: 'bg-slate-50 text-slate-800' },
] as const;

export default function SupervisionSummary({ resumen, compact = false }: { resumen: AttendanceDetail['resumen']; compact?: boolean }) {
  return <dl aria-label="Totales de asistencia" className={`grid grid-cols-2 gap-2 text-sm ${compact ? 'md:grid-cols-4' : ''}`}>
    <div className={`flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 ${compact ? 'col-span-full pb-1' : 'col-span-2 pb-2'}`}>
      <dt className="text-slate-600">Total de estudiantes</dt>
      <dd className={`font-semibold tabular-nums text-institutional-950 ${compact ? 'text-lg' : 'text-xl'}`}>{resumen.total}</dd>
    </div>
    {counts.map(({ key, label, style }) => <div key={key} className={`min-w-0 ${compact ? 'rounded-md px-2 py-1.5' : 'rounded-lg p-3'} ${style}`}>
      <dt className={compact ? 'text-xs' : undefined}>{label}</dt>
      <dd className={`font-semibold tabular-nums ${compact ? 'mt-0.5 text-lg' : 'mt-1 text-xl'}`}>{resumen[key]}</dd>
    </div>)}
  </dl>;
}
