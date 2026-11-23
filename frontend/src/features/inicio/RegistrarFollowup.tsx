import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import type { SchoolYear } from '../organizacion-escolar/anios-escolares/aniosEscolares.types';
import { educationLevelLabels, formatRegistrarSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import { useRegistrarFollowup } from './useRegistrarFollowup';

export default function RegistrarFollowup({ years, date, loading, error }: {
  years: SchoolYear[]; date: string; loading: boolean; error: string;
}) {
  const state = useRegistrarFollowup(years, date, !loading && !error);
  return <section aria-label="Estudiantes en seguimiento" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-xl font-semibold">Estudiantes que requieren atención</h2>
    {(loading || state.loading) && <LoadingState message="Consultando seguimiento del mes…" />}
    {(error || state.error) && <ErrorState message={error || state.error} />}
    {state.error && <Button variant="secondary" onClick={state.retry}>Reintentar seguimiento</Button>}
    {!loading && !error && !state.available && <p className="text-sm text-slate-600">No hay un año escolar disponible para consultar este mes.</p>}
    {state.data && (state.data.estudiantes.length === 0 ? <p className="text-sm text-slate-600">No hay estudiantes que requieran atención este mes</p>
      : <ul className="divide-y divide-slate-100">{state.data.estudiantes.map(row => <li key={row.estudiante.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}</p>
          <p className="mt-1 break-words text-slate-600">{row.secciones.map(section => `${educationLevelLabels[section.nivel]} · ${formatRegistrarSectionName(section)}`).join('; ')}</p>
        </div>
        <span className="rounded-lg bg-slate-50 px-3 py-2 font-semibold tabular-nums">{row.total} incidencias</span>
      </li>)}</ul>)}
  </section>;
}
