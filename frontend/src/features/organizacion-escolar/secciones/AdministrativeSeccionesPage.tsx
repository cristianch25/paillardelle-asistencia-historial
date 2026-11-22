import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
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
import { useInitialSchoolYear } from '../anios-escolares/useInitialSchoolYear';
import { useSectionManagement } from './useSectionManagement';
import SectionForm from './SectionForm';
import { educationLevelLabels } from './sectionPresentation';
import { useSectionManagementLevels } from './useSectionManagementLevels';
import { useAuth } from '../../auth/AuthContext';
import SectionBatchForm from './SectionBatchForm';

export default function AdministrativeSeccionesPage() {
  const { session } = useAuth();
  const years = useSchoolYears(), selection = useSectionSelection();
  const location = useLocation(), navigate = useNavigate();
  const { yearId, query, page, changeYear, changeQuery, setPage } = useAdministrativeSectionLocation();
  useInitialSchoolYear(years.years, !years.loading && !years.error, yearId, changeYear);
  const year = !years.loading && !years.error ? years.years.find(item => item.id === yearId) : undefined;
  const catalog = useSectionSearch(year?.id ?? '');
  const access = useSectionManagementLevels();
  const management = useSectionManagement(() => { selection.clear(); catalog.retry(); });
  const [level, setLevel] = useState('');
  const [attemptedYear, setAttemptedYear] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, [yearId]);
  const selectedLevel = access.levels.includes(level as Section['nivel']) ? level : '';
  const matches = searchSections(catalog.data ?? [], query).filter(section => !selectedLevel || section.nivel === selectedLevel);
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
      <div className="flex flex-wrap gap-3">
        <Button disabled={management.busy || !year || year.estado === 'CERRADO' || !access.levels.length} onClick={() => management.edit()}>Crear sección</Button>
        {session?.user.rol === 'SUBDIRECCION' && <Button variant="secondary"
          disabled={management.busy || !year || year.estado === 'CERRADO' || !access.levels.length}
          onClick={management.createMultiple}>Crear varias secciones</Button>}
        <Link to="/secciones/importar" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold">Importar padrón SIAGIE</Link>
      </div>
      <p className="text-base leading-7 text-slate-600">Consulta y administra las secciones autorizadas por año escolar.</p>
    </header>
    {years.loading ? <LoadingState message="Cargando años escolares…" /> : years.error ? <>
      <ErrorState message={years.error} /><Button variant="secondary" onClick={years.retry}>Reintentar carga de años</Button>
    </> : years.years.length === 0 ? <EmptyState message="No hay años escolares disponibles." /> : <>
      <SeccionesSearchFilters years={years.years} yearId={yearId} query={query} onQueryChange={changeQuery} disabled={management.busy}
        onYearChange={id => { changeYear(id); selection.clear(); management.close(); }} />
      {!yearId ? <EmptyState message="Selecciona un año escolar para comenzar." />
        : !year ? <ErrorState message="El año seleccionado ya no está disponible. Selecciona otro año." /> : null}
    </>}
    {access.loading && <LoadingState message="Comprobando niveles autorizados…" />}
    {access.error && <><ErrorState message={access.error} /><Button variant="secondary" onClick={access.retry}>Reintentar niveles</Button></>}
    {year && access.levels.length > 1 && <label className="block text-sm font-semibold">Filtrar por nivel
      <select className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 sm:w-auto"
        value={selectedLevel} onChange={e => { setLevel(e.target.value); setPage(1); }}><option value="">Todos los autorizados</option>
        {access.levels.map(value => <option key={value} value={value}>{educationLevelLabels[value]}</option>)}</select>
    </label>}
    {management.message && <p role="status">{management.message}</p>}
    {management.error && <ErrorState message={management.error} />}
    {year && management.editor?.multiple && session?.user.rol === 'SUBDIRECCION' && access.levels.length > 0
      && <SectionBatchForm key={`${year.id}-${access.levels.join()}`} yearId={year.id} yearLabel={year.anio}
        levels={access.levels} busy={management.busy} onSave={management.saveBatch} onCancel={management.close} />}
    {year && management.editor && !management.editor.multiple && access.levels.length > 0 && (!management.editor.section || access.levels.includes(management.editor.section.nivel))
      && <SectionForm key={`${year.id}-${management.editor.section?.id ?? 'new'}-${access.levels.join()}`}
        levels={access.levels} yearId={year.id} section={management.editor.section} busy={management.busy} onCancel={management.close} onSave={management.save} />}
    {management.confirm && <section aria-label="Confirmar estado de sección" className="space-y-3 rounded-xl border border-slate-300 bg-white p-5">
      <p>¿{management.confirm.activo ? 'Desactivar' : 'Reactivar'} {formatAdministrativeSectionName(management.confirm)}? Se conservarán sus históricos.
        {management.confirm.activo && ' No se permite con matrículas o asignaciones vigentes o futuras.'}</p>
      <div className="flex flex-wrap gap-3"><Button disabled={management.busy} onClick={() => void management.saveState()}>Confirmar estado</Button>
        <Button variant="secondary" disabled={management.busy} onClick={management.close}>Cancelar</Button></div>
    </section>}
    {catalog.loading && <LoadingState message="Cargando todas las secciones autorizadas…" />}
    {catalog.error && <><ErrorState message={catalog.error} /><Button variant="secondary" onClick={catalog.retry}>Reintentar secciones</Button></>}
    {attemptedYear === yearId && selection.checking && <LoadingState message="Comprobando la sección…" />}
    {attemptedYear === yearId && selection.error && <ErrorState message={selection.error} />}
    {catalog.data && <section aria-label="Resultados de secciones" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-slate-600">{matches.length} {matches.length === 1 ? 'sección encontrada' : 'secciones encontradas'}</p>
        <Button variant="secondary" disabled={management.busy} onClick={() => { management.close(); catalog.retry(); access.retry(); }}>Actualizar secciones</Button>
      </div>
      {catalog.data.length === 0 ? <EmptyState message="No hay secciones disponibles para este año." />
        : matches.length === 0 ? <EmptyState message="No se encontraron coincidencias para la búsqueda." />
          : <SeccionesList sections={matches.slice((currentPage - 1) * 20, currentPage * 20)} years={year ? [year] : []}
            checking={selection.checking} formatName={formatAdministrativeSectionName} showAttendance={false} onOpen={section => void openSection(section)}
            renderActions={section => <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={management.busy || year?.estado === 'CERRADO' || !access.levels.includes(section.nivel)} onClick={() => management.edit(section)}>Editar</Button>
              <Button variant="secondary" disabled={management.busy || year?.estado === 'CERRADO' || !access.levels.includes(section.nivel)} onClick={() => management.askState(section)}>{section.activo ? 'Desactivar' : 'Reactivar'}</Button>
            </div>} />}
      <Pagination pagination={{ page: currentPage, limit: 20, has_more: currentPage * 20 < matches.length }} onPageChange={setPage} />
    </section>}
  </div>;
}
