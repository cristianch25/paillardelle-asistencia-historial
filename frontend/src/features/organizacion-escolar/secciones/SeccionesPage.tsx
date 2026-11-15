import { useState } from 'react';
import Button from '../../../shared/components/Button';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import Pagination from '../../../shared/components/Pagination';
import { useSchoolYears } from '../anios-escolares/useSchoolYears';
import { useSectionSelection } from './SeccionSelectionContext';
import { useSecciones } from './useSecciones';
import SeccionesFilters from './SeccionesFilters';
import SeccionesList from './SeccionesList';
import type { SectionFilters } from './secciones.types';
import { useAuth } from '../../auth/AuthContext';
import { primaryLevelLabel } from '../../auth/userPresentation';
import MisSeccionesPage from './MisSeccionesPage';
import SeccionSeleccionada from './SeccionSeleccionada';

const emptyFilters: SectionFilters = { nivel: '', grado: '', activo: '' };

export default function SeccionesPage() {
  const { session } = useAuth();
  if (!session) return null;
  return session.user.rol === 'REGISTRADOR' ? <MisSeccionesPage /> : <FilteredSeccionesPage />;
}

function FilteredSeccionesPage() {
  const { session } = useAuth();
  const selection = useSectionSelection();
  const [yearId, setYearId] = useState(selection.selected?.year.id ?? '');
  const [filters, setFilters] = useState<SectionFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const years = useSchoolYears();
  const year = years.years.find(item => item.id === yearId);
  const sections = useSecciones(!years.loading && !years.error && year ? year.id : '', filters, page);

  function changeYear(id: string) {
    setYearId(id);
    setFilters(emptyFilters);
    setPage(1);
    selection.clear();
  }
  function changeFilters(next: SectionFilters) {
    setFilters(next);
    setPage(1);
    selection.clear();
  }
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Secciones</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">Consulta las secciones de la institución por año escolar.</p>
        {session && primaryLevelLabel(session.user) && <p className="mt-2 text-sm text-slate-600">{primaryLevelLabel(session.user)}</p>}
      </div>
      {years.loading ? <LoadingState message="Cargando años escolares…" /> : years.error ? (
        <div className="space-y-3"><ErrorState message={years.error} /><Button variant="secondary" onClick={years.retry}>Reintentar carga de años</Button></div>
      ) : !years.years.length ? <EmptyState message="No hay años escolares disponibles." /> : (
        <section aria-label="Filtros de secciones" className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <SeccionesFilters years={years.years} yearId={yearId} filters={filters} onYearChange={changeYear} onFiltersChange={changeFilters} />
        </section>
      )}
      <SeccionSeleccionada />
      {!years.loading && !years.error && years.years.length > 0 && !yearId && <EmptyState message="Selecciona un año escolar para comenzar." />}
      {!years.loading && !years.error && yearId && !year && <ErrorState message="El año seleccionado ya no está disponible. Selecciona otro año." />}
      {sections.loading && <LoadingState message="Consultando secciones…" />}
      {sections.error && <div className="space-y-3"><ErrorState message={sections.error} /><Button variant="secondary" onClick={sections.retry}>Reintentar consulta</Button></div>}
      {sections.data && <div className="space-y-6">
        {sections.data.secciones.length ? <SeccionesList sections={sections.data.secciones}
          selectedId={selection.selected?.section.id} checking={selection.checking}
          onSelect={section => { if (year) void selection.select({ section, year }); }} />
          : <EmptyState message="No se encontraron secciones en esta página con los filtros seleccionados." />}
        <Pagination pagination={sections.data.pagination} onPageChange={setPage} />
      </div>}
    </div>
  );
}
