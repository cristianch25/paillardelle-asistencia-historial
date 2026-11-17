import Button from '../../shared/components/Button';
import LoadingState from '../../shared/components/LoadingState';
import ErrorState from '../../shared/components/ErrorState';
import { useAuth } from './AuthContext';

export default function AuthInitialization() {
  const { initialization, restoreError, retryRestoration, signOut } = useAuth();
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <section aria-label="Comprobación de sesión" className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        {initialization === 'checking' ? <LoadingState message="Comprobando sesión…" /> : <>
          <ErrorState title="No se pudo comprobar la sesión" message={restoreError} />
          <Button className="w-full" onClick={() => void retryRestoration()}>Reintentar comprobación</Button>
        </>}
        <Button variant="secondary" className="w-full" onClick={signOut}>Cancelar e iniciar sesión</Button>
      </section>
    </main>
  );
}
