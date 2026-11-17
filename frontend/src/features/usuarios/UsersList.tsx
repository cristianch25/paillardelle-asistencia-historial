import Button from '../../shared/components/Button';
import { userIdentityLabel } from '../auth/userPresentation';
import { peruToday } from '../../shared/dates/civilDate';
import { assignmentSectionLabel, type ManagedUser, type UsersCatalog } from './usuarios.types';

type Props = { users: ManagedUser[]; catalog: UsersCatalog; busy: boolean; actorId: string;
  onEdit: (user: ManagedUser) => void; onState: (user: ManagedUser) => void; onAssignments: (user: ManagedUser) => void };
export default function UsersList({ users, catalog, busy, actorId, onEdit, onState, onAssignments }: Props) {
  const today = peruToday();
  return <ul aria-label="Usuarios encontrados" className="grid min-w-0 gap-4 lg:grid-cols-2">
    {users.map(user => {
      const current = catalog.assignments.filter(row => row.usuario_id === user.id && row.fecha_inicio <= today && (row.fecha_fin === null || row.fecha_fin >= today));
      return <li key={user.id} className="min-w-0 space-y-3 break-words rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">{user.nombres} {user.apellidos}</h2>
        <p className="text-sm text-slate-600">{user.usuario} · {userIdentityLabel(user)} · {user.activo ? 'ACTIVO' : 'INACTIVO'}</p>
        <p className="text-sm">Secciones vigentes: {current.length ? current.map(row => assignmentSectionLabel(row.seccion_id, catalog)).join('; ') : 'Sin asignaciones vigentes'}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => onEdit(user)}>Editar</Button>
          <Button variant="secondary" disabled={busy || user.id === actorId} onClick={() => onState(user)}>{user.activo ? 'Desactivar' : 'Activar'}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => onAssignments(user)}>Asignaciones</Button>
        </div>
      </li>;
    })}
  </ul>;
}
