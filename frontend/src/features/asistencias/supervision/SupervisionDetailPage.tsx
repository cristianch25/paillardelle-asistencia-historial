import { Link, useParams } from 'react-router';
import { useSupervisionDetail } from './useSupervisionDetail';
import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import SupervisionSummary from './SupervisionSummary';
import SupervisionStudents from './SupervisionStudents';
import LoadingState from '../../../shared/components/LoadingState';
import ErrorState from '../../../shared/components/ErrorState';
import Button from '../../../shared/components/Button';
import { formatCivilDate } from '../../../shared/dates/civilDate';

export default function SupervisionDetailPage() {
  const { sesionId = '' } = useParams();
  return <SessionDetail key={sesionId} id={sesionId} />;
}

function SessionDetail({ id }: { id: string }) {
  const query = useSupervisionDetail(id);
  return <div className="min-w-0 space-y-5">
    <Link to="/asistencias/supervision" className="inline-flex min-h-11 items-center text-sm font-semibold text-institutional-800 underline underline-offset-4">
      Volver a supervisión
    </Link>
    <header className="space-y-2">
      <p className="text-sm font-semibold text-institutional-700">Supervisión · Solo consulta</p>
      <h1 className="text-2xl font-bold text-institutional-950">Detalle de asistencia</h1>
    </header>
    {query.loading && <LoadingState message="Consultando sesión de asistencia…" />}
    {query.error && <><ErrorState message={query.error} /><Button variant="secondary" onClick={query.retry}>Reintentar detalle</Button></>}
    {query.data && <>
      <section aria-label="Sesión consultada" className="min-w-0 space-y-4 break-words rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-institutional-950">{educationLevelLabels[query.data.section.nivel]} · {formatSectionName(query.data.section)}</h2>
        <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-600">
          <p>Fecha: {formatCivilDate(query.data.attendance.sesion.fecha)}</p>
          <p className="font-semibold">{query.data.attendance.sesion.estado === 'ABIERTA' ? 'Sesión abierta' : 'Sesión cerrada'}</p>
        </div>
        <SupervisionSummary resumen={query.data.attendance.resumen} />
        <Button variant="secondary" onClick={query.retry}>Actualizar detalle</Button>
      </section>
      <SupervisionStudents padron={query.data.attendance.padron} />
    </>}
  </div>;
}
