import { useEffect } from 'react';
import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import { useSectionSelection } from './SeccionSelectionContext';
import { educationLevelLabels, formatSectionName } from './sectionPresentation';

export default function SeccionSeleccionada() {
  const { selected, checking, error, revalidate, clear } = useSectionSelection();
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
        <Button variant="secondary" className="mt-4" onClick={clear}>Limpiar selección</Button>
      </section>}
    </>
  );
}
