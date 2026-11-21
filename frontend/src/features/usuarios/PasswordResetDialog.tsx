import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { resetUserPassword, uncertainUserFailure, userFailure } from './usuarios.api';
import type { ManagedUser } from './usuarios.types';

type ResetUser = Pick<ManagedUser, 'id' | 'usuario' | 'nombres' | 'apellidos' | 'rol'>;
export default function PasswordResetDialog({ user, onClose }: { user: ResetUser; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false), mounted = useRef(true);
  const [busy, setBusy] = useState(false), [secret, setSecret] = useState(''), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  useUnsavedChanges(`password-reset:${user.id}`, false, busy);
  useEffect(() => {
    const element = dialog.current!; mounted.current = true; element.showModal();
    return () => { mounted.current = false; element.close(); };
  }, []);
  async function reset() {
    if (running.current || secret || uncertain) return;
    running.current = true; setBusy(true); setError('');
    try { const value = await resetUserPassword(user.id); if (mounted.current) setSecret(value); }
    catch (cause) {
      if (!mounted.current) return;
      const unknown = uncertainUserFailure(cause); setUncertain(unknown);
      setError(unknown ? 'No se pudo confirmar el resultado. No se repetirá el restablecimiento. Actualiza la consulta antes de decidir otro intento.' : userFailure(cause));
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="password-reset-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
    <h2 id="password-reset-title" className="text-xl font-bold">Restablecer contraseña</h2>
    <p className="break-words">Cuenta: <strong>{user.usuario}</strong> · {user.nombres} {user.apellidos}</p>
    {secret ? <>
      <p>Contraseña temporal generada. Guárdala y entrégala al titular: al cerrar esta ventana no podrás consultarla otra vez.</p>
      <output aria-label="Contraseña temporal" className="block break-all rounded-lg bg-slate-100 p-4 font-mono text-lg select-all">{secret}</output>
      <Button onClick={onClose}>He guardado la contraseña</Button>
    </> : <>
      <p>Se reemplazará la contraseña por una nueva generada al azar. {user.rol === 'ADMIN'
        ? 'Los datos de la cuenta se conservarán.' : 'Los datos de la cuenta y sus asignaciones se conservarán.'}</p>
      <p className="text-sm text-slate-600">{user.rol === 'ADMIN'
        ? 'El titular deberá cambiar la contraseña antes de acceder a funciones institucionales. Los JWT anteriores no se revocan: su acceso quedará restringido mientras el cambio esté pendiente.'
        : 'Las sesiones ya iniciadas seguirán vigentes hasta su vencimiento. No se exigirá cambiar la contraseña al iniciar sesión.'}</p>
      {error && <ErrorState message={error} />}
      <div className="flex flex-wrap gap-3">{uncertain ? <Button onClick={onClose}>Actualizar consulta</Button> : <>
        <Button disabled={busy} onClick={() => void reset()}>{busy ? 'Restableciendo…' : 'Confirmar restablecimiento'}</Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button></>}</div>
    </>}
  </dialog>;
}
