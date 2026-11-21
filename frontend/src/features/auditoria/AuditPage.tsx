import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import Button from '../../shared/components/Button';
import LoadingState from '../../shared/components/LoadingState';
import ErrorState from '../../shared/components/ErrorState';
import EmptyState from '../../shared/components/EmptyState';
import Pagination from '../../shared/components/Pagination';
import { apiErrorMessage } from '../../shared/api/apiError';
import { getAuditLog } from './auditoria.api';
import type { AuditResponse } from './auditoria.types';
import { activityName, activityDetail, responsibleName, responsibleRole, auditActionOptions } from './auditPresentation';

function formatAuditTime(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

export default function AuditPage() {
  const { session } = useAuth();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [accion, setAccion] = useState('');

  const loadData = useCallback(async (p: number, a: string) => {
    setLoading(true); setError('');
    try {
      const res = await getAuditLog({ page: p, limit: 20, accion: a || undefined });
      setData(res);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user.rol === 'ADMIN') {
      void loadData(page, accion);
    }
  }, [session, page, accion, loadData]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.user.rol !== 'ADMIN') return <Navigate to="/inicio" replace />;

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Historial de actividades</h1>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void loadData(page, accion)}>
          Actualizar
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="filtro-accion" className="text-sm font-semibold text-slate-700">
          Filtrar por actividad
        </label>
        <select id="filtro-accion" value={accion}
          onChange={e => { setAccion(e.target.value); setPage(1); }}
          className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-institutional-700 sm:w-auto">
          {auditActionOptions.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {loading && <LoadingState message="Cargando actividades…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && data && (
        data.registros.length === 0 ? (
          <EmptyState message="No se encontraron actividades para el criterio seleccionado." />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[40rem] text-left text-sm text-slate-800">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Fecha y hora</th>
                    <th scope="col" className="px-4 py-3">Responsable</th>
                    <th scope="col" className="px-4 py-3">Actividad</th>
                    <th scope="col" className="px-4 py-3">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.registros.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatAuditTime(r.fecha_hora)}</td>
                      <td className="px-4 py-3">
                        <p className="break-words font-semibold text-slate-900" title={r.accion === 'CREAR_SUPERUSUARIO_LOCAL' ? 'Alta realizada mediante la herramienta local' : 'Nombre actual de la cuenta responsable'}>{responsibleName(r.usuario)}</p>
                        {r.usuario.rol && <p className="mt-1 text-xs text-slate-600" title="Rol actual de la cuenta">{responsibleRole(r.usuario.rol)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-institutional-950">
                          {activityName(r)}
                        </span>
                      </td>
                      <td className="break-words px-4 py-3 text-slate-700">{activityDetail(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={data.pagination} onPageChange={setPage} />
          </div>
        )
      )}
    </div>
  );
}
