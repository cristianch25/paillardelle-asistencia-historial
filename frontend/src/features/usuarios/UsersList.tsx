import Button from '../../shared/components/Button';
import { userIdentityLabel } from '../auth/userPresentation';
import { peruToday } from '../../shared/dates/civilDate';
import { educationLevelLabels, formatAdministrativeSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import type { ManagedUser, UsersCatalog } from './usuarios.types';

const nameKey = (user: ManagedUser) => `${user.nombres} ${user.apellidos}`.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');

function groupedSections(assignments: UsersCatalog['assignments'], catalog: UsersCatalog, today: string) {
  const groups = new Map<string, string[]>();
  const multipleYears = new Set(assignments.map(row => catalog.sections.find(section => section.id === row.seccion_id)?.anio_escolar_id)).size > 1;
  for (const assignment of assignments) {
    const section = catalog.sections.find(row => row.id === assignment.seccion_id);
    if (!section) { groups.set('Sección no disponible', []); continue; }
    const year = catalog.years.find(row => row.id === section.anio_escolar_id);
    const context = multipleYears || !year || String(year.anio) !== today.slice(0, 4) || year.estado !== 'ABIERTO';
    const status = year?.estado === 'CERRADO' ? ' (año cerrado)' : year?.estado === 'PLANIFICADO' ? ' (planificado)' : '';
    const label = `${educationLevelLabels[section.nivel]}${context ? ` · ${year?.anio ?? 'Año no disponible'}${status}` : ''}`;
    const names = groups.get(label) ?? [];
    names.push(formatAdministrativeSectionName(section)); groups.set(label, names);
  }
  return [...groups];
}

type Props = { users: ManagedUser[]; catalog: UsersCatalog; busy: boolean; actorId: string;
  onEdit: (user: ManagedUser) => void; onState: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void };
export default function UsersList({ users, catalog, busy, actorId, onEdit, onState, onResetPassword }: Props) {
  const today = peruToday();
  const names = new Set<string>(), duplicates = new Set<string>();
  for (const user of catalog.users) {
    const name = nameKey(user);
    if (names.has(name)) duplicates.add(name);
    names.add(name);
  }
  return <ul aria-label="Usuarios encontrados" className="grid min-w-0 gap-4 lg:grid-cols-2">
    {users.map(user => {
      const current = catalog.assignments.filter(row => row.usuario_id === user.id && row.fecha_inicio <= today && (row.fecha_fin === null || row.fecha_fin >= today));
      return <li key={user.id} className="min-w-0 space-y-3 break-words rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold">{user.nombres} {user.apellidos}</h2>
        {duplicates.has(nameKey(user)) && <p className="text-xs text-slate-500">{user.usuario}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-slate-600">{user.rol === 'SUPERUSUARIO' ? 'Superusuario' : userIdentityLabel(user)}</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${user.activo ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{user.activo ? 'Activo' : 'Inactivo'}</span>
        </div>
        {current.length ? <div className="space-y-1 text-sm">{groupedSections(current, catalog, today).map(([label, names]) =>
          <p key={label}>{label}{names.length > 0 && `: ${names.join(', ')}`}</p>)}
        </div> : <p className="text-sm">Sin secciones asignadas</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => onEdit(user)}>Editar</Button>
          <Button variant="secondary" disabled={busy || user.id === actorId} onClick={() => onState(user)}>{user.activo ? 'Desactivar' : 'Activar'}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => onResetPassword(user)}>Restablecer contraseña</Button>
        </div>
      </li>;
    })}
  </ul>;
}
