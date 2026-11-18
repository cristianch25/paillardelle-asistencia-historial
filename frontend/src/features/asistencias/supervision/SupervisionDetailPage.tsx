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
    <Link to="/asistencias/supervision" className="inline-flex min-h-11 items-center text-sm font-semibold text-institutional-800 underline underline-offset-4">
      Volver a Asistencias
    </Link>
    <header className="space-y-2">
      <p className="text-sm font-semibold text-institutional-700">Asistencias · Detalle</p>
      <h1 className="text-2xl font-bold text-institutional-950">Detalle de asistencia</h1>
    </header>
    {query.loading && <LoadingState message="Consultando sesión de asistencia…" />}
    {query.error && <><ErrorState message={query.error} /><Button variant="secondary" onClick={query.retry}>Reintentar detalle</Button></>}
    {query.data && editable && <AdminSectionDetail detail={query.data} retry={query.retry} />}
  </div>;
}
