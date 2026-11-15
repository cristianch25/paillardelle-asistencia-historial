import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../../shared/components/Button';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import FormField from '../../../shared/components/FormField';
import LoadingState from '../../../shared/components/LoadingState';
import { useSectionSelection } from './SeccionSelectionContext';
import { educationLevelLabels, formatSectionName } from './sectionPresentation';
import { peruToday, validCivilDate } from '../../../shared/dates/civilDate';
import { usePadron } from './usePadron';
import EstudiantesList from './EstudiantesList';

export default function EstudiantesSeccionPage() {
  const { session } = useAuth();
  const selection = useSectionSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const [fecha, setFecha] = useState(() => peruToday());
  const { selected, checking, error, revalidate } = selection;
  const padron = usePadron(session && !checking && !error ? selected : null, fecha);
  const valid = validCivilDate(fecha);
  const backLabel = session?.user.rol === 'REGISTRADOR' ? 'mis secciones' : 'secciones';
  const section = padron.data?.seccion ?? selected?.section;
  const back = `/secciones${location.search}`;
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
          {section && <section aria-label="Detalle de sección" className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="break-words text-xl font-semibold">{formatSectionName(section)} · {educationLevelLabels[section.nivel]}</h2>
            <p>Año escolar {selected.year.anio}</p>
            {section.turno && <p className="break-words">Turno: {section.turno}</p>}
          </section>}
          <div className="max-w-xs"><FormField label="Fecha de consulta" type="date" value={fecha}
            onChange={event => setFecha(event.target.value)}
            error={valid ? undefined : 'Selecciona una fecha completa y válida.'} /></div>
          {valid && <Link to={{ pathname: '/secciones/asistencia', search: location.search }} state={{ fecha }}
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-institutional-950 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700">Asistencia diaria</Link>}
          {padron.loading && <LoadingState message="Consultando estudiantes…" />}
          {padron.error && <div className="space-y-3"><ErrorState message={padron.error} />
            <Button variant="secondary" onClick={padron.retry}>Reintentar consulta</Button></div>}
          {padron.data && <EstudiantesList entries={padron.data.padron} />}
        </>
      )}
    </div>
  );
}
