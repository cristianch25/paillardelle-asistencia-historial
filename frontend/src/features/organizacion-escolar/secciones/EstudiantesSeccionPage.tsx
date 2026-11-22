import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../../shared/components/Button';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import { useSectionSelection } from './SeccionSelectionContext';
import { educationLevelLabels, formatAdministrativeSectionName, formatSectionName } from './sectionPresentation';
import { formatCivilDate, validCivilDate } from '../../../shared/dates/civilDate';
import { usePadron } from './usePadron';
import EstudiantesList from './EstudiantesList';
import SectionStaff from './SectionStaff';
import StudentProfileButton from '../../estudiantes/perfil/StudentProfileButton';
import { useRetirados } from './useRetirados';
import { padronReferenceDate } from './padronReferenceDate';

export default function EstudiantesSeccionPage() {
  const { session } = useAuth();
  if (!session) return null;
  const scope = JSON.stringify([session.user.id, session.user.rol, session.user.nivel_asignado, session.expiresAt]);
  return <StudentsSection key={scope} />;
}

function StudentsSection() {
  const { session } = useAuth();
  const selection = useSectionSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const { selected, checking, error, revalidate } = selection;
  const administrative = session?.user.rol === 'ADMIN' || session?.user.rol === 'SUBDIRECCION';
  const retired = useRetirados(administrative && !checking && !error ? selected?.section.id ?? null : null);
  const fecha = administrative ? (selected ? padronReferenceDate(selected.year) : '') : selection.attendanceDate;
  const padron = usePadron(session && !checking && !error ? selected : null, fecha);
  const valid = validCivilDate(fecha);
  const backLabel = session?.user.rol === 'REGISTRADOR' ? 'mis secciones' : 'secciones';
  const section = padron.data?.seccion ?? selected?.section;
  const back = `/secciones${location.search}`;

  const handleRefresh = () => {
    padron.retry();
    retired.retry();
  };
  return (
    <div className="space-y-6">
      <Button variant="secondary" onClick={() => navigate(back)}>
        <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />Volver a {backLabel}
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">Estudiantes de la sección</h1>
      {checking ? <LoadingState message="Comprobando la sección…" /> : error ? (
        <div className="space-y-3"><ErrorState message={error} />
          <Button variant="secondary" onClick={() => void revalidate()}>Volver a comprobar selección</Button></div>
      ) : !selected ? <EmptyState message="Selecciona una sección para consultar sus estudiantes." /> : (
        <>
          {administrative && section && <section aria-label="Detalle de sección" className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="break-words text-xl font-semibold">{(administrative ? formatAdministrativeSectionName : formatSectionName)(section)} · {educationLevelLabels[section.nivel]}</h2>
            <p>Año escolar {selected.year.anio}</p>
            {section.turno && <p className="break-words">Turno: {section.turno}</p>}
          </section>}
          {administrative && valid && <SectionStaff sectionId={selected.section.id} yearId={selected.year.id} date={fecha} />}
          {administrative ? (valid ? <p className="font-medium">Padrón al {formatCivilDate(fecha)}</p>
            : <ErrorState message="No se puede determinar la fecha del padrón. Revisa las fechas del año escolar." />)
            : null}
          {padron.loading && <LoadingState message="Consultando estudiantes…" />}
          {padron.error && <div className="space-y-3"><ErrorState message={padron.error} />
            <Button variant="secondary" onClick={padron.retry}>Reintentar consulta</Button></div>}
          {padron.data && (
            <EstudiantesList
              entries={padron.data.padron}
              section={padron.data.seccion ?? selected.section}
              yearId={selected.year.id}
              date={fecha}
              onRefresh={handleRefresh}
            />
          )}
          {administrative && <section aria-label="Estudiantes retirados">
            {retired.loading && <LoadingState message="Cargando estudiantes retirados…" />}
            {retired.error && <div className="space-y-3"><ErrorState message={retired.error} />
              <Button variant="secondary" onClick={retired.retry}>Reintentar retirados</Button></div>}
            {!retired.loading && !retired.error && retired.data.length === 0 && (
              <EmptyState message="No hay estudiantes retirados en esta sección." />
            )}
            {retired.data.length > 0 && (
              <details className="rounded-xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold text-slate-800">
                  Estudiantes retirados ({retired.data.length})
                </summary>
                <ul className="mt-3 divide-y divide-slate-100">
                  {retired.data.map(entry => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {[entry.estudiante.apellido_paterno, entry.estudiante.apellido_materno, entry.estudiante.nombres].filter(Boolean).join(' ')}
                        </p>
                        <p className="text-sm text-slate-500">Retirado el {formatCivilDate(entry.fecha_retiro)}</p>
                      </div>
                      <StudentProfileButton studentId={entry.estudiante_id} yearId={selected.year.id} month={entry.fecha_retiro.slice(0, 7)} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>}
        </>
      )}
    </div>
  );
}
