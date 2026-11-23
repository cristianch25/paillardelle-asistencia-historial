import { useState, type SubmitEvent } from 'react';
import Button from '../../shared/components/Button';
import FormField from '../../shared/components/FormField';
import ErrorState from '../../shared/components/ErrorState';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { adminRequest, type AdminDraft } from './adminAccounts.api';

type Props = { busy: boolean; onSave: (draft: AdminDraft) => Promise<boolean>; onCancel: () => void };
export default function AdminAccountForm({ busy, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<AdminDraft>({ nombres: '', apellidos: '', usuario: '', password: '' });
  const [confirmation, setConfirmation] = useState(''), [review, setReview] = useState(false), [error, setError] = useState('');
  useUnsavedChanges('new-admin', Object.values(draft).some(Boolean) || Boolean(confirmation), busy);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    try { adminRequest(draft); if (draft.password !== confirmation) throw new Error('Las contraseñas no coinciden.'); }
    catch (failure) { setError((failure as Error).message); return; }
    setError('');
    if (!review) { setReview(true); return; }
    await onSave(draft);
    setDraft(current => ({ ...current, password: '' })); setConfirmation(''); setReview(false);
  }
  return <form aria-label="Crear cuenta ADMIN" onSubmit={event => void submit(event)} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-xl font-semibold">Nueva cuenta ADMIN</h2>
    {error && <ErrorState message={error} />}
    {review ? <section aria-label="Confirmar creación de ADMIN" className="space-y-3">
      <p>¿Crear la cuenta <strong>{draft.usuario}</strong> para {draft.nombres} {draft.apellidos} con rol ADMIN?</p>
      <p className="text-sm text-slate-600">Deberá cambiar la contraseña inicial antes de acceder a funciones institucionales de ADMIN. Entrégala al titular por un medio seguro.</p>
    </section> : <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
      {(['nombres', 'apellidos', 'usuario'] as const).map(key => <FormField key={key}
        label={{ nombres: 'Nombres', apellidos: 'Apellidos', usuario: 'Identificador de usuario' }[key]}
        required maxLength={key === 'nombres' ? 100 : key === 'apellidos' ? 120 : 60} autoComplete="off"
        value={draft[key]} onChange={e => setDraft(current => ({ ...current, [key]: e.target.value }))} />)}
      <FormField label="Contraseña inicial" type="password" required autoComplete="new-password" value={draft.password}
        hint="Mínimo 8 caracteres y máximo 72 bytes UTF-8." onChange={e => setDraft(current => ({ ...current, password: e.target.value }))} />
      <FormField label="Confirmar contraseña inicial" type="password" required autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
      <p className="self-center text-sm">Rol de la nueva cuenta: ADMIN</p>
    </fieldset>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>{busy ? 'Creando…' : review ? 'Confirmar creación' : 'Revisar creación'}</Button>
      {review && <Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>Volver al formulario</Button>}
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
