import { useState } from 'react';
import axios from 'axios';
import { LogOut } from 'lucide-react';
import InstitutionalBrand from '../../shared/components/InstitutionalBrand';
import Button from '../../shared/components/Button';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { apiErrorMessage } from '../../shared/api/apiError';
import { useAuth } from './AuthContext';

export default function SessionPage() {
  const { session, signOut, verifySession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);

  async function checkSession() {
    setBusy(true);
    setError('');
    setVerified(false);
    try {
      await verifySession();
      setVerified(true);
    } catch (failure) {
      if (!axios.isCancel(failure)) setError(apiErrorMessage(failure));
    } finally { setBusy(false); }
  }

  if (!session) return null;
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <section aria-labelledby="session-title" className="w-full max-w-lg space-y-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-9">
        <InstitutionalBrand />
        <div>
          <h1 id="session-title" className="text-xl font-semibold">Sesión iniciada</h1>
          <p className="mt-2 break-words text-base text-slate-700">{session.user.nombres} {session.user.apellidos}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="font-semibold">Usuario</dt><dd className="break-words text-slate-600">{session.user.usuario}</dd></div>
            <div><dt className="font-semibold">Rol</dt><dd className="text-slate-600">{session.user.rol}</dd></div>
          </dl>
        </div>
        {error && <ErrorState message={error} />}
        {busy && <LoadingState message="Comprobando la sesión…" />}
        {verified && <p role="status" className="text-sm text-institutional-800">Sesión verificada con el servidor.</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={checkSession} disabled={busy}>Verificar sesión</Button>
          <Button variant="secondary" onClick={signOut}><LogOut aria-hidden="true" className="size-4" />Cerrar sesión</Button>
        </div>
        <p className="text-xs leading-5 text-slate-600">Esta vista confirma el acceso. Las funcionalidades académicas se incorporarán en próximas etapas.</p>
      </section>
    </main>
  );
}
