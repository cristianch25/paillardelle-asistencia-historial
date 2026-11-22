import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import Button from '../../shared/components/Button';
import FormField from '../../shared/components/FormField';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import EmptyState from '../../shared/components/EmptyState';
import Pagination from '../../shared/components/Pagination';
import { saveUser, setUserState } from './usuarios.api';
import { matchesUser, type ManagedUser } from './usuarios.types';
import { useUsers } from './useUsers';
import UserForm from './UserForm';
import UsersList from './UsersList';
import PasswordResetDialog from './PasswordResetDialog';

export default function UsersPage() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.rol !== 'ADMIN') return <Navigate to="/inicio" replace />;
  return <AdminUsers key={`${session.user.id}:${session.expiresAt}`} actorId={session.user.id} />;
}

function AdminUsers({ actorId }: { actorId: string }) {
  const catalog = useUsers(), id = useId(), { request } = useNavigationProtection();
  const [text, setText] = useState(''), [role, setRole] = useState(''), [state, setState] = useState(''), [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ user?: ManagedUser } | null>(null);
  const [confirm, setConfirm] = useState<ManagedUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  useUnsavedChanges('users-operation', false, catalog.busy);
  const data = catalog.data;
  const users = data?.users.filter(user => matchesUser(user, text) && (!role || user.rol === role) && (!state || String(user.activo) === state)) ?? [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(users.length / 20)));
  function close() { setEditor(null); setConfirm(null); setPasswordUser(null); }
  function open(action: () => void) { void request(() => { close(); action(); }); }
  const selectStyle = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
  return <div className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Usuarios</h1>
      <Button disabled={!data || catalog.busy} onClick={() => open(() => setEditor({}))}>Nuevo usuario</Button></header>
    {catalog.notice && <p role="status" className="rounded-lg bg-sky-soft p-3 text-sm">{catalog.notice}</p>}
    {catalog.loading && <LoadingState message="Cargando usuarios y asignaciones…" />}
    {catalog.error && <ErrorState message={catalog.error} />}
    {!catalog.loading && !data && <Button variant="secondary" disabled={catalog.busy} onClick={() => open(catalog.refresh)}>Actualizar consulta</Button>}
    {data && (editor ? <UserForm key={editor.user?.id ?? 'new'} user={editor.user} busy={catalog.busy}
      onCancel={() => open(close)} onSave={async draft => { const ok = await catalog.perform(() => saveUser(draft, editor.user)); if (ok) close(); return ok; }} />
      : <>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="relative min-w-0 [&_input]:rounded-full [&_input]:border-institutional-700 [&_input]:pl-11 [&_input]:shadow-sm">
            <FormField label="Buscar por nombre o identificador" type="search" value={text}
              onChange={e => { setText(e.target.value); setPage(1); }} />
            <Search aria-hidden="true" className="pointer-events-none absolute bottom-3 left-4 size-5 text-institutional-700" />
          </div>
          <label className="text-sm font-semibold" htmlFor={`${id}-role`}>Filtrar por rol<select id={`${id}-role`} className={selectStyle} value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
            <option value="">Todos</option><option value="REGISTRADOR">REGISTRADOR</option><option value="SUBDIRECCION">SUBDIRECCION</option><option value="ADMIN">ADMIN</option>
          </select></label>
          <label className="text-sm font-semibold" htmlFor={`${id}-state`}>Filtrar por estado<select id={`${id}-state`} className={selectStyle} value={state} onChange={e => { setState(e.target.value); setPage(1); }}>
            <option value="">Todos</option><option value="true">ACTIVO</option><option value="false">INACTIVO</option>
          </select></label></div>
        {confirm && <section aria-label="Confirmar estado de cuenta" className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
          <p>¿{confirm.activo ? 'Desactivar' : 'Activar'} la cuenta de {confirm.nombres} {confirm.apellidos}?</p>
          <Button disabled={catalog.busy} onClick={() => void catalog.perform(() => setUserState(confirm.id, !confirm.activo)).then(ok => { if (ok) setConfirm(null); })}>Confirmar estado</Button>
          <Button variant="secondary" disabled={catalog.busy} onClick={() => setConfirm(null)}>Cancelar</Button>
        </section>}
        <p role="status" className="text-sm text-slate-600">{users.length} usuarios encontrados</p>
        {!users.length ? <EmptyState message="No hay usuarios para estos filtros." /> : <UsersList users={users.slice((currentPage - 1) * 20, currentPage * 20)} catalog={data}
          actorId={actorId} busy={catalog.busy} onEdit={user => open(() => setEditor({ user }))} onState={setConfirm}
          onResetPassword={user => open(() => setPasswordUser(user))} />}
        <Pagination pagination={{ page: currentPage, limit: 20, has_more: currentPage * 20 < users.length }} onPageChange={setPage} />
      </>)}
    {passwordUser && <PasswordResetDialog user={passwordUser} onClose={() => { setPasswordUser(null); catalog.refresh(); }} />}
  </div>;
}
