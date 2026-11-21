import { Link, useParams } from 'react-router';
import { useSupervisionDetail } from './useSupervisionDetail';
import LoadingState from '../../../shared/components/LoadingState';
import ErrorState from '../../../shared/components/ErrorState';
import Button from '../../../shared/components/Button';
import { useAuth } from '../../auth/AuthContext';
import AdminSectionDetail from '../integrada/AdminSectionDetail';

export default function SupervisionDetailPage() {
  const { sesionId = '' } = useParams();
  return <SessionDetail key={sesionId} id={sesionId} />;
}

function SessionDetail({ id }: { id: string }) {
  const query = useSupervisionDetail(id);
  const { session } = useAuth();
  const editable = Boolean(session && ['ADMIN', 'SUBDIRECCION'].includes(session.user.rol));
  return <div className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-institutional-950">Detalle de asistencia</h1>
      <Link to="/asistencias/supervision" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-institutional-950 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700">
        Volver a Asistencias
      </Link>
    </header>
    {query.loading && <LoadingState message="Consultando sesión de asistencia…" />}
    {query.error && <><ErrorState message={query.error} /><Button variant="secondary" onClick={query.retry}>Reintentar detalle</Button></>}
    {query.data && editable && <AdminSectionDetail detail={query.data} retry={query.retry} />}
  </div>;
}
