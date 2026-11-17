import { educationLevelLabels } from '../organizacion-escolar/secciones/sectionPresentation';
import type { DailySummary } from './dailySummary';

const cards = [
  { key: 'presentes', label: 'Presentes', style: 'bg-emerald-50 text-emerald-900' },
  { key: 'tardanzas', label: 'Tardanzas', style: 'bg-amber-50 text-amber-950' },
  { key: 'faltas', label: 'Faltas', style: 'bg-red-50 text-red-900' },
  { key: 'pendientes', label: 'Pendientes', style: 'bg-sky-50 text-sky-900' },
] as const;

export default function DailySummaryView({ data }: { data: DailySummary }) {
  return <section aria-label="Resumen diario institucional" className="space-y-5">
    <dl aria-label="Conteos de asistencia" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(card => <div key={card.key} className={`min-w-0 rounded-xl border border-slate-200 p-4 ${card.style}`}>
        <dt className="text-sm font-semibold">{card.label}</dt>
        <dd className="mt-2 text-2xl font-bold tabular-nums">{data.counts ? data.counts[card.key] : <span className="text-base">Sin datos</span>}</dd>
      </div>)}
    </dl>
    {!data.counts && <p className="text-sm text-slate-600">No hay asistencia registrada para esta fecha.</p>}
    <section aria-label="Asistencia registrada por nivel" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Asistencia registrada por nivel</h2>
      <dl className="divide-y divide-slate-100">{data.levels.map(level => <div key={level.nivel}
        aria-label={`Resumen de ${educationLevelLabels[level.nivel]}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <dt className="font-medium">{educationLevelLabels[level.nivel]}:
          {level.lective === false && <span className="mt-1 block text-xs font-normal text-slate-600">Fecha no lectiva</span>}
        </dt>
        <dd className="font-semibold tabular-nums">{level.sections ? `${level.registered}/${level.sections}` : 'Sin salones disponibles'}</dd>
      </div>)}</dl>
      {data.sections ? <div className="space-y-1 text-sm text-slate-600">
        <p>Salones con asistencia registrada: <strong>{data.registered}</strong></p>
        <p>Salones sin asistencia registrada: <strong>{data.unregistered}</strong></p>
      </div> : <p className="text-sm text-slate-600">No hay salones para el año seleccionado.</p>}
      <p className="text-sm text-slate-600">Un salón cuenta como registrado aunque tenga estudiantes pendientes. Esto no significa que todas las marcas estén completas.</p>
      {data.sections > 0 && <p className="border-t border-slate-200 pt-4 font-semibold">Total institucional: {data.registered}/{data.sections} salones</p>}
    </section>
  </section>;
}
