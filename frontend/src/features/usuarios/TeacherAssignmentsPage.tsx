import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { useTeacherAssignments } from './useTeacherAssignments';
import { assignSections } from './assignments.api';
import { finalizeUserAssignment } from './usuarios.api';
import UserAssignments from './UserAssignments';

export default function TeacherAssignmentsPage() {
  const { session } = useAuth();
  return session?.user.rol === 'SUBDIRECCION'
    ? <AssignmentsContent key={`${session.user.id}:${session.expiresAt}:${session.user.nivel_asignado}`} /> : <Navigate to="/inicio" replace />;
}
function AssignmentsContent() {
  const catalog = useTeacherAssignments(), { request } = useNavigationProtection();
  const [userId, setUser] = useState('');
  useUnsavedChanges('teacher-assignments-operation', false, catalog.busy);
  const data = catalog.data, user = data?.registrars.find(row => row.id === userId);
  const finalize = (row: Parameters<typeof finalizeUserAssignment>[0], date: string) => catalog.perform(() => finalizeUserAssignment(row, date));
  return <div className="min-w-0 space-y-5">
    <h1 className="text-2xl font-bold">Asignaciones docentes</h1>
    {catalog.loading && <LoadingState message="Cargando asignaciones…" />}
    {catalog.error && <ErrorState message={catalog.error} />}
    {catalog.notice && <p role="status" className="rounded-lg bg-sky-soft p-3 text-sm">{catalog.notice}</p>}
    {!catalog.loading && !data && <Button variant="secondary" disabled={catalog.busy}
      onClick={() => void request(catalog.refresh)}>Reintentar consulta</Button>}
    {data && <>
      <label className="block text-sm font-semibold">Docente o auxiliar
        <select value={userId} disabled={catalog.busy} onChange={event => { const value = event.target.value; void request(() => setUser(value)); }}
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-3 text-base focus-visible:outline-2 focus-visible:outline-institutional-700">
          <option value="">Selecciona un registrador</option>{data.registrars.map(row => <option key={row.id} value={row.id}>{row.nombres} {row.apellidos} · {row.cargo === 'AUXILIAR' ? 'Auxiliar' : row.cargo === 'DOCENTE' ? 'Docente' : 'Registrador'}</option>)}
        </select>
      </label>
      {!data.registrars.length && <p>No hay registradores activos disponibles para tus niveles.</p>}
      {user && <UserAssignments key={user.id} user={user} catalog={data} busy={catalog.busy} onClose={() => void request(() => setUser(''))}
        onSave={input => catalog.perform(() => assignSections(input))} onFinalize={finalize} />}
    </>}
  </div>;
}
