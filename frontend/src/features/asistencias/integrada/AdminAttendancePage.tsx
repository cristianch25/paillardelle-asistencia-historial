import { useState } from 'react';
import { Search } from 'lucide-react';
import { useSchoolYears } from '../../organizacion-escolar/anios-escolares/useSchoolYears';
import { useInitialSchoolYear } from '../../organizacion-escolar/anios-escolares/useInitialSchoolYear';
import { useNavigationProtection } from '../../../shared/navigation/NavigationProtectionContext';
import { useSupervisionWorkspace } from '../supervision/useSupervisionWorkspace';
import { useSupervisionQuery } from '../supervision/useSupervisionQuery';
import { supervisionDateError } from '../supervision/supervisionDate';
import SupervisionSectionCard from '../supervision/SupervisionSectionCard';
import { useStudentSearch } from '../gestion/useStudentSearch';
import { searchRowKey } from '../gestion/studentSearch.types';
import StudentSearchResults from '../gestion/StudentSearchResults';
import FormField from '../../../shared/components/FormField';
import Button from '../../../shared/components/Button';
import Pagination from '../../../shared/components/Pagination';
import LoadingState from '../../../shared/components/LoadingState';
import ErrorState from '../../../shared/components/ErrorState';
import EmptyState from '../../../shared/components/EmptyState';
import AdminAttendanceFilters from './AdminAttendanceFilters';
import StudentAttendanceProfile from './StudentAttendanceProfile';
import { useAuth } from '../../auth/AuthContext';
import { supervisionLevels } from '../supervision/supervisionAccess';

export default function AdminAttendancePage() {
  const { session } = useAuth();
  const years = useSchoolYears(), { request } = useNavigationProtection();
  const { filters, setFilters, yearInitialization } = useSupervisionWorkspace();
  const [text, setText] = useState(''), [page, setPage] = useState(1), [selection, setSelection] = useState({ key: '', id: '' });
  const searching = Boolean(text.trim());
  useInitialSchoolYear(years.years, !years.loading && !years.error, filters.anio_escolar_id,
    id => setFilters(current => ({ ...current, anio_escolar_id: id, page: 1 })), yearInitialization);
  const year = years.years.find(row => row.id === filters.anio_escolar_id);
  const cards = useSupervisionQuery(filters, !searching && Boolean(year && !years.loading && !years.error && !supervisionDateError(filters.fecha, year)));
  const search = useStudentSearch(filters.fecha, text, page, searching);
  const selected = selection.key === search.key ? search.data?.resultados.find(row => searchRowKey(row) === selection.id) : null;
  function change(action: () => void) { void request(() => { setSelection({ key: '', id: '' }); action(); }); }
  function refreshResults() { setSelection({ key: '', id: '' }); search.retry(); }
  return <div className="min-w-0 space-y-5">
    <h1 className="text-2xl font-bold sm:text-3xl">Asistencias</h1>
    <div className="relative w-full max-w-2xl [&_label]:text-base [&_label]:font-bold [&_input]:rounded-full [&_input]:border-institutional-700 [&_input]:pl-11 [&_input]:shadow-sm">
      <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-11 size-5 text-institutional-700" />
      <FormField label="Buscar estudiante" type="search" autoComplete="off" placeholder="Nombres, apellidos o código" value={text}
      onChange={e => { const value = e.target.value; change(() => { setText(value); setPage(1); search.retry(); if (!value.trim()) cards.retry(); }); }} />
    </div>
    {years.loading ? <LoadingState message="Cargando años escolares…" /> : years.error ? <>
      <ErrorState message={years.error} /><Button variant="secondary" onClick={years.retry}>Reintentar años escolares</Button>
    </> : <AdminAttendanceFilters years={years.years} value={filters} globalSearch={searching}
      levels={session ? supervisionLevels(session.user) : []}
      onChange={next => change(() => { setFilters(next); setPage(1); if (next.fecha !== filters.fecha) search.retry(); })} />}
    {searching ? <>
      <p className="text-sm text-slate-600">La búsqueda usa la fecha y todos los niveles autorizados. Año y nivel filtran solo los salones.</p>
      {selected ? <StudentAttendanceProfile key={selection.id} row={selected} onBack={refreshResults} onReload={refreshResults} /> : <>
        {search.loading && <LoadingState message="Buscando estudiantes…" />}
        {search.error && <><ErrorState message={search.error} /><Button variant="secondary" onClick={search.retry}>Reintentar búsqueda</Button></>}
        {search.data && <section aria-label="Búsqueda global de asistencias" className="space-y-4">
          {search.data.resultados.length ? <StudentSearchResults rows={search.data.resultados} selectedKey=""
            onSelect={id => setSelection({ key: search.key, id })} /> : <EmptyState message="No se encontraron estudiantes." />}
          <Pagination pagination={search.data.pagination} onPageChange={setPage} />
        </section>}
      </>}
      <Button variant="secondary" onClick={() => change(() => { setText(''); setPage(1); search.retry(); cards.retry(); })}>Limpiar búsqueda</Button>
    </> : <>
      {!filters.anio_escolar_id && !years.loading && <EmptyState message="Selecciona un año escolar para consultar los salones." />}
      {cards.loading && <LoadingState message="Consultando asistencias de los salones…" />}
      {cards.error && <><ErrorState message={cards.error} /><Button variant="secondary" onClick={cards.retry}>Reintentar consulta</Button></>}
      {cards.data && <section aria-label="Resultados de supervisión" className="space-y-4">
        <Button variant="secondary" onClick={cards.retry}>Actualizar consulta</Button>
        {cards.data.secciones.length ? <ul aria-label="Secciones de supervisión" className="grid gap-3 sm:grid-cols-2">
          {cards.data.secciones.map(item => <SupervisionSectionCard key={item.seccion.id} item={item} />)}
        </ul> : <EmptyState message="No hay secciones para los filtros seleccionados." />}
        <Pagination pagination={cards.data.pagination} onPageChange={next => setFilters(current => ({ ...current, page: next }))} />
      </section>}
    </>}
  </div>;
}
