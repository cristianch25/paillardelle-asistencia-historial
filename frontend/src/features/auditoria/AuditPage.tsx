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

const AUDIT_ACTIONS = [
  { value: '', label: 'Todas las operaciones' },
  { value: 'CAMBIAR_PASSWORD', label: 'Cambiar contraseña' },
  { value: 'RESTABLECER_PASSWORD', label: 'Restablecer contraseña' },
  { value: 'CREAR_USUARIO', label: 'Crear usuario' },
  { value: 'ACTUALIZAR_USUARIO', label: 'Actualizar usuario' },
  { value: 'CREAR_ASIGNACION', label: 'Asignar docente' },
  { value: 'FINALIZAR_ASIGNACION', label: 'Finalizar asignación' },
  { value: 'RETIRAR_MATRICULA', label: 'Retirar matrícula' },
  { value: 'CAMBIO_SECCION', label: 'Cambiar sección' },
  { value: 'REINGRESAR_MATRICULA', label: 'Reingresar estudiante' },
  { value: 'CREAR_MATRICULA', label: 'Matricular estudiante' },
  { value: 'CREAR_ANIO_ESCOLAR', label: 'Crear año escolar' },
  { value: 'ACTUALIZAR_ANIO_ESCOLAR', label: 'Actualizar año escolar' },
  { value: 'CREAR_SECCION', label: 'Crear sección' },
  { value: 'ACTUALIZAR_SECCION', label: 'Actualizar sección' },
  { value: 'IMPORTAR_PADRON', label: 'Importar padrón' },
  { value: 'ABRIR_SESION', label: 'Abrir sesión de asistencia' },
  { value: 'CERRAR_SESION', label: 'Cerrar sesión de asistencia' },
  { value: 'ACTUALIZAR_TELEFONO_APODERADO', label: 'Actualizar teléfono' },
];

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
          <h1 className="text-2xl font-bold">Auditoría administrativa</h1>
          <p className="mt-1 text-sm text-slate-600">Registro histórico de operaciones del sistema. Consulta de solo lectura.</p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void loadData(page, accion)}>
          Actualizar
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="filtro-accion" className="text-sm font-semibold text-slate-700">
          Tipo de operación:
        </label>
        <select id="filtro-accion" value={accion}
          onChange={e => { setAccion(e.target.value); setPage(1); }}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2">
          {AUDIT_ACTIONS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {loading && <LoadingState message="Cargando registros de auditoría…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && data && (
        data.registros.length === 0 ? (
          <EmptyState message="No se encontraron registros de auditoría para el criterio seleccionado." />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-800">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Fecha y hora</th>
                    <th scope="col" className="px-4 py-3">Usuario responsable</th>
                    <th scope="col" className="px-4 py-3">Operación</th>
                    <th scope="col" className="px-4 py-3">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.registros.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatAuditTime(r.fecha_hora)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{r.usuario.nombre_completo}</p>
                        <p className="text-xs text-slate-500">@{r.usuario.usuario} · <span className="font-medium text-slate-700">{r.usuario.rol}</span></p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 border border-sky-200">
                          {r.accion_nombre}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.descripcion}</td>
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
