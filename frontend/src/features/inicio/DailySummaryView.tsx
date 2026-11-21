import { educationLevelLabels } from '../organizacion-escolar/secciones/sectionPresentation';
import type { DailySummary } from './dailySummary';
import type { EducationLevel } from '../organizacion-escolar/secciones/secciones.types';
import ErrorState from '../../shared/components/ErrorState';

const cards = [
  { key: 'presentes', label: 'Presentes', style: 'bg-emerald-50 text-emerald-900' },
  { key: 'tardanzas', label: 'Tardanzas', style: 'bg-amber-50 text-amber-950' },
  { key: 'faltas', label: 'Faltas', style: 'bg-red-50 text-red-900' },
  { key: 'pendientes', label: 'Pendientes', style: 'bg-sky-50 text-sky-900' },
] as const;

export default function DailySummaryView({ data, levels }: { data: DailySummary; levels?: readonly EducationLevel[] }) {
  if (levels && data.levels.some(level => level.sections > 0 && !levels.includes(level.nivel))) {
    return <ErrorState message="El resumen recibido contiene niveles fuera del ámbito de asistencia. Actualiza la consulta." />;
  }
  const visible = data.levels.filter(level => !levels || levels.includes(level.nivel));
  const populated = visible.filter(level => level.sections > 0);
  const nonLective = populated.filter(level => level.lective === false);
  const allNonLective = populated.length > 0 && nonLective.length === populated.length;
  return <section aria-label={levels ? 'Resumen diario de niveles autorizados' : 'Resumen diario institucional'} className="space-y-5">
    {nonLective.length > 0 && <p className="rounded-lg bg-sky-soft p-4 text-sm leading-6 text-institutional-950">
      {allNonLective ? 'Fecha no lectiva. No corresponde registrar asistencia en esta fecha.'
        : `No corresponde registrar asistencia en ${nonLective.map(level => educationLevelLabels[level.nivel]).join(' y ')} en esta fecha no lectiva.`}
    </p>}
    {!levels && <dl aria-label="Conteos de asistencia" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(card => <div key={card.key} className={`min-w-0 rounded-xl border border-slate-200 p-4 ${card.style}`}>
        <dt className="text-sm font-semibold">{card.label}</dt>
        <dd className="mt-2 text-2xl font-bold tabular-nums">{data.counts ? data.counts[card.key] : <span className="text-base">Sin datos</span>}</dd>
      </div>)}
    </dl>}
    {!data.sections ? <p className="text-sm text-slate-600">No hay salones para el año seleccionado.</p>
      : !levels && !data.counts && !allNonLective && <p className="text-sm text-slate-600">No hay asistencia registrada para esta fecha.</p>}
    {levels && <section aria-label="Asistencia registrada por nivel" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Asistencia registrada por nivel</h2>
      <dl className="divide-y divide-slate-100">{visible.map(level => <div key={level.nivel}
        aria-label={`Resumen de ${educationLevelLabels[level.nivel]}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <dt className="font-medium">{educationLevelLabels[level.nivel]}:</dt>
        <dd aria-label={level.sections > 0 && level.lective === true
          ? `${level.registered} de ${level.sections} secciones registradas` : undefined}>
          {!level.sections ? <span className="text-sm text-slate-600">Sin salones disponibles</span>
            : level.lective === false ? <span className="text-sm text-slate-600">{level.sections} secciones autorizadas</span>
              : <div className="min-w-24 rounded-lg border border-slate-200 bg-sky-soft px-4 py-2 text-center">
                <span className="block text-xl font-semibold leading-6 tabular-nums text-institutional-950">{level.registered}/{level.sections}</span>
                <span className="block text-xs text-slate-600">registradas</span>
              </div>}
        </dd>
      </div>)}</dl>
    </section>}
  </section>;
}
