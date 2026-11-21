import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import Button from '../../shared/components/Button';
import LoadingState from '../../shared/components/LoadingState';
import ErrorState from '../../shared/components/ErrorState';
import EmptyState from '../../shared/components/EmptyState';
import Pagination from '../../shared/components/Pagination';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';
import { createAdminAccount, type AdminAccount } from './adminAccounts.api';
import { setUserState } from './usuarios.api';
import { useAdminAccounts } from './useAdminAccounts';
import AdminAccountForm from './AdminAccountForm';
import PasswordResetDialog from './PasswordResetDialog';

export default function AdminAccountsPage() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.rol !== 'SUPERUSUARIO') return <Navigate to="/inicio" replace />;
  return <AdminAccounts key={`${session.user.id}:${session.expiresAt}`} />;
}

function AdminAccounts() {
  const catalog = useAdminAccounts(), { request } = useNavigationProtection();
  const [creating, setCreating] = useState(false), [stateUser, setStateUser] = useState<AdminAccount | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminAccount | null>(null);
  useUnsavedChanges('admin-account-operation', false, catalog.busy);
  function close() { setCreating(false); setStateUser(null); setPasswordUser(null); }
  function refresh(page?: number) { void request(() => { close(); catalog.refresh(page); }); }
  return <div className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Administradores</h1>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={catalog.busy} onClick={() => refresh()}>Actualizar consulta</Button>
        <Button disabled={!catalog.data || catalog.busy || creating || Boolean(stateUser)} onClick={() => setCreating(true)}>Crear ADMIN</Button></div></header>
    <p className="text-sm text-slate-600">Consulta y gestión de cuentas ADMIN. Desactivar una cuenta conserva sus datos y registros.</p>
    {catalog.notice && <p role="status" className="rounded-lg bg-sky-soft p-3 text-sm">{catalog.notice}</p>}
    {catalog.loading && <LoadingState message="Cargando cuentas ADMIN…" />}
    {catalog.error && <ErrorState message={catalog.error} />}
    {catalog.data && (creating ? <AdminAccountForm busy={catalog.busy} onCancel={() => { void request(close); }}
      onSave={async draft => { const ok = await catalog.perform(() => createAdminAccount(draft)); if (ok) setCreating(false); return ok; }} /> : <>
      {stateUser && <section aria-label="Confirmar estado de ADMIN" className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
        <p>¿{stateUser.activo ? 'Desactivar' : 'Activar'} la cuenta ADMIN <strong>{stateUser.usuario}</strong> de {stateUser.nombres} {stateUser.apellidos}?</p>
        <p className="text-sm text-slate-600">Debe conservarse al menos un ADMIN activo. El servidor verificará esta condición.</p>
        <div className="flex flex-wrap gap-3"><Button disabled={catalog.busy} onClick={() => void catalog.perform(() => setUserState(stateUser.id, !stateUser.activo)).then(ok => { if (ok) setStateUser(null); })}>Confirmar estado</Button>
          <Button variant="secondary" disabled={catalog.busy} onClick={() => setStateUser(null)}>Cancelar</Button></div>
      </section>}
      {!catalog.data.users.length ? <EmptyState message="No hay cuentas ADMIN en esta página." /> : <ul aria-label="Cuentas ADMIN" className="grid min-w-0 gap-4 lg:grid-cols-2">
        {catalog.data.users.map(user => <li key={user.id} className="min-w-0 space-y-3 break-words rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{user.nombres} {user.apellidos}</h2>
          <p className="text-sm text-slate-600">{user.usuario} · ADMIN · {user.activo ? 'ACTIVO' : 'INACTIVO'}</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={catalog.busy || Boolean(stateUser)} onClick={() => setStateUser(user)}>{user.activo ? 'Desactivar' : 'Activar'}</Button>
            <Button variant="secondary" disabled={catalog.busy || Boolean(stateUser)} onClick={() => setPasswordUser(user)}>Restablecer contraseña</Button></div>
        </li>)}
      </ul>}
      <Pagination pagination={catalog.data.pagination} onPageChange={page => refresh(page)} />
    </>)}
    {passwordUser && <PasswordResetDialog user={passwordUser}
      onClose={() => { setPasswordUser(null); catalog.refresh(); }} />}
  </div>;
}
