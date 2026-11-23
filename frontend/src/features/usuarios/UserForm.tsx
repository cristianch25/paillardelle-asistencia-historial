import { useId, useState, type SubmitEvent } from 'react';
import FormField from '../../shared/components/FormField';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { initialUserDraft, userRequest, type ManagedUser, type UserDraft } from './usuarios.types';

type Props = { user?: ManagedUser; busy: boolean; onSave: (draft: UserDraft) => Promise<boolean>; onCancel: () => void };
const control = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
export default function UserForm({ user, busy, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState(() => initialUserDraft(user)), [error, setError] = useState('');
  const id = useId(), admin = user?.rol === 'ADMIN';
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialUserDraft(user));
  useUnsavedChanges(`user-form:${user?.id ?? 'new'}`, dirty, busy);
  const update = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    try { userRequest(draft, user); } catch (failure) { setError((failure as Error).message); return; }
    setError('');
    await onSave(draft);
    // La credencial inicial no se conserva después de un intento de envío.
    setDraft(current => ({ ...current, password: '' }));
  }
  return <form aria-label={user ? 'Editar usuario' : 'Nuevo usuario'} onSubmit={event => void submit(event)} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-xl font-semibold">{user ? 'Editar usuario' : 'Nuevo usuario'}</h2>
    {error && <ErrorState message={error} />}
    <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2 [&_label>span[aria-hidden=true]]:hidden">
      <FormField label="Nombres" required maxLength={100} value={draft.nombres} onChange={e => update('nombres', e.target.value)} />
      <FormField label="Apellidos" required maxLength={120} value={draft.apellidos} onChange={e => update('apellidos', e.target.value)} />
      <FormField label="Identificador de usuario" required autoComplete="off" maxLength={60} value={draft.usuario} onChange={e => update('usuario', e.target.value)} />
      {!user && <FormField label="Contraseña inicial" type="password" required autoComplete="new-password" value={draft.password}
        hint="Mínimo 8 caracteres y máximo 72 bytes UTF-8. Comunícala al titular por un medio seguro." onChange={e => update('password', e.target.value)} />}
      {admin ? <p className="self-center text-sm">Cuenta administrativa: se conservan su rol, cargo y nivel.</p> : <>
        <label className="text-sm font-semibold" htmlFor={`${id}-role`}>Rol
          <select id={`${id}-role`} className={control} value={draft.rol} onChange={e => setDraft(current => ({ ...current,
            rol: e.target.value, cargo: e.target.value === 'REGISTRADOR' ? 'DOCENTE' : '' }))}>
            <option value="REGISTRADOR">REGISTRADOR</option><option value="SUBDIRECCION">SUBDIRECCION</option>
          </select>
        </label>
        {draft.rol === 'REGISTRADOR' ? <label className="text-sm font-semibold" htmlFor={`${id}-cargo`}>Cargo
          <select id={`${id}-cargo`} required className={control} value={draft.cargo} onChange={e => update('cargo', e.target.value)}>
            <option value="">Selecciona un cargo</option><option value="DOCENTE">DOCENTE</option><option value="AUXILIAR">AUXILIAR</option>
          </select>
        </label> : <FormField label="Cargo" maxLength={30} value={draft.cargo} hint="Opcional, hasta 30 caracteres. No concede permisos."
          onChange={e => update('cargo', e.target.value)} />}
        <label className="text-sm font-semibold" htmlFor={`${id}-level`}>{draft.rol === 'SUBDIRECCION' ? 'Nivel principal' : 'Nivel asignado'}
          <select id={`${id}-level`} className={control} required={draft.rol === 'SUBDIRECCION'} value={draft.nivel_asignado}
            onChange={e => update('nivel_asignado', e.target.value as UserDraft['nivel_asignado'])}>
            <option value="">{draft.rol === 'SUBDIRECCION' ? 'Selecciona un nivel' : 'Sin nivel fijo'}</option>
            <option value="INICIAL">Inicial</option><option value="PRIMARIA">Primaria</option><option value="SECUNDARIA">Secundaria</option>
          </select>
        </label>
      </>}
    </fieldset>
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar usuario'}</Button>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
