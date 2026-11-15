import type { AttendanceDetail } from '../asistencias.types';

const counts = [
  { key: 'faltas', label: 'Faltas', style: 'bg-red-50 text-red-900' },
  { key: 'tardanzas', label: 'Tardanzas', style: 'bg-amber-50 text-amber-950' },
  { key: 'pendientes', label: 'Pendientes', style: 'bg-sky-50 text-sky-900' },
  { key: 'presentes', label: 'Presentes', style: 'bg-slate-50 text-slate-800' },
] as const;

export default function SupervisionSummary({ resumen }: { resumen: AttendanceDetail['resumen'] }) {
  return <dl aria-label="Totales de asistencia" className="grid grid-cols-2 gap-2 text-sm">
    <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">Total de estudiantes</dt>
      <dd className="text-xl font-semibold tabular-nums text-institutional-950">{resumen.total}</dd>
    </div>
    {counts.map(({ key, label, style }) => <div key={key} className={`min-w-0 rounded-lg p-3 ${style}`}>
      <dt>{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{resumen[key]}</dd>
    </div>)}
  </dl>;
}
