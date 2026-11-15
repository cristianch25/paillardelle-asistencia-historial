import { useSectionListLocation } from './useSectionListLocation';
import Button from '../../../shared/components/Button';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import Pagination from '../../../shared/components/Pagination';
import { useSchoolYears } from '../anios-escolares/useSchoolYears';
import { useSectionSelection } from './SeccionSelectionContext';
import SeccionSeleccionada from './SeccionSeleccionada';
import SeccionesList from './SeccionesList';
import { useSecciones } from './useSecciones';

export default function MisSeccionesPage() {
  const { page, setPage } = useSectionListLocation();
  const sections = useSecciones(null, { nivel: '', grado: '', activo: '' }, page);
  const years = useSchoolYears();
  const selection = useSectionSelection();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mis secciones</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">Consulta las secciones que tienes asignadas.</p>
      </div>
      <SeccionSeleccionada />
      {sections.loading && <LoadingState message="Cargando mis secciones…" />}
      {sections.error && <div className="space-y-3"><ErrorState message={sections.error} />
        <Button variant="secondary" onClick={sections.retry}>Reintentar consulta</Button></div>}
      {years.loading && <LoadingState message="Cargando años escolares…" />}
      {years.error && <div className="space-y-3"><ErrorState message={years.error} />
        <p className="text-sm text-slate-600">Para seleccionar una sección, vuelve a cargar los años escolares.</p>
        <Button variant="secondary" onClick={years.retry}>Reintentar carga de años</Button></div>}
      {sections.data && <div className="space-y-6">
        {sections.data.secciones.length ? <SeccionesList sections={sections.data.secciones} years={years.years}
          selectedId={selection.selected?.section.id} checking={selection.checking || years.loading || Boolean(years.error)}
          onSelect={section => {
            const year = years.years.find(item => item.id === section.anio_escolar_id);
            if (year) void selection.select({ section, year });
          }} /> : <EmptyState message="No hay secciones disponibles en esta página para tu cuenta." />}
        <Pagination pagination={sections.data.pagination} onPageChange={setPage} />
      </div>}
    </div>
  );
}
