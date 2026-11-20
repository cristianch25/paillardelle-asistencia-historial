import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Button from '../../shared/components/Button';
import { errorEscritura } from '../../shared/api/apiError';
import { changePassword } from './auth.api';

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);

  async function submit() {
    if (busy || running.current || uncertain || success) return;
    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener como mínimo 8 caracteres.');
      return;
    }
    if (nueva !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    running.current = true; setBusy(true); setError('');
    try {
      await changePassword({
        password_actual: actual,
        password_nueva: nueva,
        password_confirmacion: confirmacion,
      });
      setSuccess('Contraseña cambiada correctamente.');
    } catch (err: unknown) {
      const fallo = errorEscritura(err);
      setError(fallo.mensaje); setUncertain(fallo.incierto);
    } finally { setBusy(false); running.current = false; }
  }

  const inputType = show ? 'text' : 'password';

  return (
    <dialog ref={dialog} aria-labelledby="change-password-title"
      onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
      <h2 id="change-password-title" className="text-xl font-bold">Cambiar contraseña</h2>
      <p className="text-sm text-slate-600">Ingresa tu contraseña actual y define tu nueva contraseña (mínimo 8 caracteres).</p>

      {success ? (
        <div className="space-y-4 pt-2">
          <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 border border-emerald-200">
            {success}
          </p>
          <Button type="button" onClick={onClose} className="w-full">
            Cerrar
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <label className="block text-sm font-semibold">
            Contraseña actual
            <input type={inputType} required disabled={busy || uncertain} value={actual} autoFocus
              onChange={e => { setActual(e.target.value); setError(''); }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-slate-900" />
          </label>

          <label className="block text-sm font-semibold">
            Nueva contraseña (mínimo 8 caracteres)
            <input type={inputType} required minLength={8} disabled={busy || uncertain} value={nueva}
              onChange={e => { setNueva(e.target.value); setError(''); }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-slate-900" />
          </label>

          <label className="block text-sm font-semibold">
            Confirmar nueva contraseña
            <input type={inputType} required minLength={8} disabled={busy || uncertain} value={confirmacion}
              onChange={e => { setConfirmacion(e.target.value); setError(''); }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 p-2 text-slate-900" />
          </label>

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => setShow(prev => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-institutional-700 hover:text-institutional-900 focus-visible:outline-2">
              {show ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
              {show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700 border border-rose-200">
              {error}
            </p>
          )}

          {uncertain && <p className="text-sm text-slate-600">Para comprobar el cambio, inicia sesión en una ventana privada con la nueva contraseña.</p>}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={busy || uncertain || !actual || !nueva || !confirmacion}>
              {busy ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              {uncertain ? 'Cerrar' : 'Cancelar'}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
