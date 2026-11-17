import { useAuth } from '../../auth/AuthContext';
import { useSchoolYears } from '../../organizacion-escolar/anios-escolares/useSchoolYears';
import Button from '../../../shared/components/Button';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import Pagination from '../../../shared/components/Pagination';
import { supervisionLevels } from './supervisionAccess';
import SupervisionFilters from './SupervisionFilters';
import SupervisionSectionCard from './SupervisionSectionCard';
import { useSupervisionQuery } from './useSupervisionQuery';
import { useSupervisionSections } from './useSupervisionSections';
import { useSupervisionWorkspace } from './useSupervisionWorkspace';
import { supervisionDateError } from './supervisionDate';

export default function SupervisionPage() {
  const { session } = useAuth();
  const years = useSchoolYears();
  const { filters, setFilters } = useSupervisionWorkspace();
  const year = years.years.find(item => item.id === filters.anio_escolar_id);
  const dateError = supervisionDateError(filters.fecha, year);
  const enabled = Boolean(year) && !years.loading && !years.error && !dateError;
  const query = useSupervisionQuery(filters, enabled);
  const sections = useSupervisionSections(filters, enabled);
  return <div className="min-w-0 space-y-6">
    <header className="space-y-2">
      <p className="text-sm font-semibold text-institutional-700">Asistencias · Solo consulta</p>
      <h1 className="text-2xl font-bold text-institutional-950 sm:text-3xl">Supervisión de asistencias</h1>
      <p className="text-sm text-slate-600">Consulta las secciones autorizadas por año escolar y fecha.</p>
    </header>
    {years.loading ? <LoadingState message="Cargando años escolares…" /> : years.error ? <>
      <ErrorState message={years.error} /><Button variant="secondary" onClick={years.retry}>Reintentar años escolares</Button>
    </> : <>
      <section aria-label="Filtros de supervisión" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <SupervisionFilters years={years.years} levels={supervisionLevels(session!.user)} options={sections} value={filters} onChange={setFilters} />
      </section>
      {!filters.anio_escolar_id ? <EmptyState message="Selecciona un año escolar para consultar la supervisión." />
        : null}
      {query.loading && <LoadingState message="Consultando supervisión de asistencias…" />}
      {query.error && <><ErrorState message={query.error} /><Button variant="secondary" onClick={query.retry}>Reintentar consulta</Button></>}
      {query.data && <section aria-label="Resultados de supervisión" className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-slate-600">{query.data.secciones.length} secciones en esta página · {query.data.fecha}</p>
          <Button variant="secondary" onClick={() => { query.retry(); sections.retry(); }}>Actualizar consulta</Button>
        </div>
        {query.data.secciones.length === 0 ? <EmptyState message="No hay secciones para los filtros seleccionados." />
          : <ul aria-label="Secciones de supervisión" className="grid gap-3 sm:grid-cols-2">
            {query.data.secciones.map(item => <SupervisionSectionCard key={item.seccion.id} item={item} />)}
          </ul>}
        <Pagination pagination={query.data.pagination} onPageChange={page => setFilters(current => ({ ...current, page }))} />
      </section>}
    </>}
  </div>;
}
