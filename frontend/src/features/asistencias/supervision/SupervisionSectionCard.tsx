import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import type { SupervisionSection } from './supervision.types';
import { Link } from 'react-router';
import SupervisionSummary from './SupervisionSummary';

const situations = {
  ABIERTA: { label: 'Sesión abierta', style: 'border-sky-200 bg-sky-50 text-sky-900' },
  CERRADA: { label: 'Sesión cerrada', style: 'border-slate-200 bg-slate-100 text-slate-700' },
  SIN_REGISTRO: { label: 'Sin registro', style: 'border-slate-200 bg-white text-slate-600' },
};

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
    </p> : <SupervisionSummary resumen={resumen} />}
    {situacion !== 'SIN_REGISTRO' && item.sesion_id !== null && <Link to={`/asistencias/supervision/${item.sesion_id}`}
      aria-label={`Ver detalle de ${formatSectionName(seccion)}`}
      className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold text-institutional-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-institutional-700">
      Ver detalle
    </Link>}
  </li>;
}
