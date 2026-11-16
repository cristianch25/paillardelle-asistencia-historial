import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSchoolYears } from '../anios-escolares/useSchoolYears';
import { useSectionSelection } from './SeccionSelectionContext';
import { useAdministrativeSectionLocation } from './useAdministrativeSectionLocation';
import { useSectionSearch } from './useSectionSearch';
import { searchSections } from './sectionSearch';
import { formatAdministrativeSectionName } from './sectionPresentation';
import type { Section } from './secciones.types';
import SeccionesSearchFilters from './SeccionesSearchFilters';
import SeccionesList from './SeccionesList';
import Button from '../../../shared/components/Button';
import LoadingState from '../../../shared/components/LoadingState';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import Pagination from '../../../shared/components/Pagination';

export default function AdministrativeSeccionesPage() {
  const years = useSchoolYears(), selection = useSectionSelection();
  const location = useLocation(), navigate = useNavigate();
  const { yearId, query, page, changeYear, changeQuery, setPage } = useAdministrativeSectionLocation();
  const year = !years.loading && !years.error ? years.years.find(item => item.id === yearId) : undefined;
  const catalog = useSectionSearch(year?.id ?? '');
  const [attemptedYear, setAttemptedYear] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, [yearId]);
  const matches = searchSections(catalog.data ?? [], query);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(matches.length / 20)));
  async function openSection(section: Section) {
    if (!year) return;
    const current = generation.current;
    setAttemptedYear(year.id);
    if (await selection.select({ section, year }) && current === generation.current) {
      await navigate(`/secciones/estudiantes${location.search}`);
    }
  }
  return <div className="min-w-0 space-y-6">
    <header className="space-y-3"><h1 className="text-3xl font-bold tracking-tight">Secciones</h1>
      <p className="text-base leading-7 text-slate-600">Consulta las secciones autorizadas por año escolar.</p>
    </header>
    {years.loading ? <LoadingState message="Cargando años escolares…" /> : years.error ? <>
      <ErrorState message={years.error} /><Button variant="secondary" onClick={years.retry}>Reintentar carga de años</Button>
    </> : years.years.length === 0 ? <EmptyState message="No hay años escolares disponibles." /> : <>
      <SeccionesSearchFilters years={years.years} yearId={yearId} query={query} onQueryChange={changeQuery}
        onYearChange={id => { changeYear(id); selection.clear(); }} />
      {!yearId ? <EmptyState message="Selecciona un año escolar para comenzar." />
        : !year ? <ErrorState message="El año seleccionado ya no está disponible. Selecciona otro año." /> : null}
    </>}
    {catalog.loading && <LoadingState message="Cargando todas las secciones autorizadas…" />}
    {catalog.error && <><ErrorState message={catalog.error} /><Button variant="secondary" onClick={catalog.retry}>Reintentar secciones</Button></>}
    {attemptedYear === yearId && selection.checking && <LoadingState message="Comprobando la sección…" />}
    {attemptedYear === yearId && selection.error && <ErrorState message={selection.error} />}
    {catalog.data && <section aria-label="Resultados de secciones" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-slate-600">{matches.length} {matches.length === 1 ? 'sección encontrada' : 'secciones encontradas'}</p>
        <Button variant="secondary" onClick={catalog.retry}>Actualizar secciones</Button>
      </div>
      {catalog.data.length === 0 ? <EmptyState message="No hay secciones disponibles para este año." />
        : matches.length === 0 ? <EmptyState message="No se encontraron coincidencias para la búsqueda." />
          : <SeccionesList sections={matches.slice((currentPage - 1) * 20, currentPage * 20)} years={year ? [year] : []}
            checking={selection.checking} formatName={formatAdministrativeSectionName} showAttendance={false} onOpen={section => void openSection(section)} />}
      <Pagination pagination={{ page: currentPage, limit: 20, has_more: currentPage * 20 < matches.length }} onPageChange={setPage} />
    </section>}
  </div>;
}
