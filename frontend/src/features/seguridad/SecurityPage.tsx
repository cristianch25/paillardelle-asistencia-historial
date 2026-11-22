import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import Button from '../../shared/components/Button';
import LoadingState from '../../shared/components/LoadingState';
import ErrorState from '../../shared/components/ErrorState';
import EmptyState from '../../shared/components/EmptyState';
import Pagination from '../../shared/components/Pagination';
import { apiErrorMessage } from '../../shared/api/apiError';
import { formatEventTime } from '../../shared/dates/formatEventTime';
import { getSecurityEvents, type SecurityResponse } from './seguridad.api';

function SecurityEvents() {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: SecurityResponse | null; error: string }>({ key: '', data: null, error: '' });
  const key = `${page}:${revision}`;
  useEffect(() => {
    let current = true;
    void getSecurityEvents(page).then(data => { if (current) setResult({ key, data, error: '' }); })
      .catch(error => { if (current) setResult({ key, data: null, error: apiErrorMessage(error) }); });
    return () => { current = false; };
  }, [page, key]);
  const loading = result.key !== key, data = !loading ? result.data : null;
  return <div className="min-w-0 space-y-5">
    <h1 className="text-2xl font-bold">Seguridad</h1>
    {loading && <LoadingState message="Consultando eventos de seguridad…" />}
    {!loading && result.error && <><ErrorState message={result.error} />
      <Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Reintentar consulta</Button></>}
    {data && <>
      {!data.registros.length ? <EmptyState message="No hay eventos de seguridad registrados." /> : <ul className="space-y-3" aria-label="Eventos de seguridad">
        {data.registros.map(event => <li key={event.id} className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-semibold text-institutional-950">{event.evento}</p>
          <p className="text-sm text-slate-600">{formatEventTime(event.fecha_hora)}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-600">Responsable</dt><dd className="break-words font-medium">{event.responsable.nombre || 'No identificado'}</dd></div>
            <div><dt className="text-slate-600">Cuenta afectada</dt><dd className="break-words">{event.cuenta.nombre || (event.cuenta.id ? `Cuenta ${event.cuenta.id}` : 'No disponible')}</dd></div>
          </dl>
        </li>)}
      </ul>}
      <Pagination pagination={data.pagination} onPageChange={setPage} />
    </>}
  </div>;
}

export default function SecurityPage() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.rol !== 'SUPERUSUARIO') return <Navigate to="/inicio" replace />;
  return <SecurityEvents key={`${session.user.id}:${session.expiresAt}`} />;
}
