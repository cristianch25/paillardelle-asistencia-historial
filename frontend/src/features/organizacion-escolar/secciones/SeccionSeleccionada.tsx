import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import { useSectionSelection } from './SeccionSelectionContext';
import { educationLevelLabels, formatSectionName } from './sectionPresentation';

export default function SeccionSeleccionada() {
  const { selected, checking, error, revalidate, clear } = useSectionSelection();
  const location = useLocation();
  useEffect(() => { void revalidate(); }, [revalidate]);
  return (
    <>
      {checking && <LoadingState message="Comprobando la sección…" />}
      {error && <div className="space-y-3"><ErrorState message={error} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void revalidate()}>Volver a comprobar selección</Button>
          <Button variant="secondary" onClick={clear}>Limpiar selección</Button>
        </div>
      </div>}
      {selected && <section aria-labelledby="selection-title" className="rounded-xl border border-institutional-700 bg-white p-5 sm:p-6">
        <h2 id="selection-title" className="text-lg font-semibold">Sección seleccionada</h2>
        <p role="status" className="mt-3 break-words font-medium">{formatSectionName(selected.section)} — {educationLevelLabels[selected.section.nivel]}</p>
        <p className="mt-2 text-sm text-slate-600">Año escolar {selected.year.anio} · {selected.year.estado}</p>
        <p className="mt-2 text-sm text-slate-600">{selected.section.activo ? 'Activa' : 'Inactiva'}{selected.section.turno ? ` · Turno: ${selected.section.turno}` : ''}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link to={`/secciones/asistencia${location.search}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-institutional-800 bg-institutional-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-institutional-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700">Asistencia diaria</Link>
          <Link to={`/secciones/estudiantes${location.search}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-institutional-950 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700">Ver estudiantes</Link>
          <Button variant="tertiary" className="sm:ml-auto" onClick={clear}>Limpiar selección</Button>
        </div>
      </section>}
    </>
  );
}
