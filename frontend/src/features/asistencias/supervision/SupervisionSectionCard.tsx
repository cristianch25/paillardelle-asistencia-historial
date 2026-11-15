import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import type { SupervisionSection } from './supervision.types';

const situations = {
  ABIERTA: { label: 'Sesión abierta', style: 'border-sky-200 bg-sky-50 text-sky-900' },
  CERRADA: { label: 'Sesión cerrada', style: 'border-slate-200 bg-slate-100 text-slate-700' },
  SIN_REGISTRO: { label: 'Sin registro', style: 'border-slate-200 bg-white text-slate-600' },
};

const counts = [
  { key: 'faltas', label: 'Faltas', style: 'bg-red-50 text-red-900' },
  { key: 'tardanzas', label: 'Tardanzas', style: 'bg-amber-50 text-amber-950' },
  { key: 'pendientes', label: 'Pendientes', style: 'bg-sky-50 text-sky-900' },
  { key: 'presentes', label: 'Presentes', style: 'bg-slate-50 text-slate-800' },
] as const;

export default function SupervisionSectionCard({ item }: { item: SupervisionSection }) {
  const { seccion, situacion, es_lectivo, resumen } = item;
  const situation = situations[situacion];
  return <li className="min-w-0 space-y-4 break-words rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <header className="space-y-1">
      <p className="text-sm text-slate-600">{educationLevelLabels[seccion.nivel]}</p>
      <h2 className="text-lg font-semibold text-institutional-950">{formatSectionName(seccion)}</h2>
    </header>
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      <p className={`rounded-full border px-3 py-1 ${situation.style}`}>
        <span className="sr-only">Situación de la sesión: </span>{situation.label}
      </p>
      <p className="rounded-full border border-slate-200 px-3 py-1 text-slate-600">
        {es_lectivo ? 'Fecha lectiva' : 'Fecha no lectiva'}
      </p>
    </div>
    {resumen === null ? <p className="text-sm leading-6 text-slate-600">
      {situacion === 'SIN_REGISTRO' ? 'No hay sesión registrada para esta fecha.' : 'Resumen no disponible.'}
    </p> : <dl aria-label="Totales de asistencia" className="grid grid-cols-2 gap-2 text-sm">
      <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
        <dt className="text-slate-600">Total de estudiantes</dt>
        <dd className="text-xl font-semibold tabular-nums text-institutional-950">{resumen.total}</dd>
      </div>
      {counts.map(({ key, label, style }) => <div key={key} className={`min-w-0 rounded-lg p-3 ${style}`}>
        <dt>{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{resumen[key]}</dd>
      </div>)}
    </dl>}
  </li>;
}
