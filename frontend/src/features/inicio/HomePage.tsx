import { useAuth } from '../auth/AuthContext';
import { lazy, Suspense } from 'react';
import LoadingState from '../../shared/components/LoadingState';
import RegistrarHomePage from './RegistrarHomePage';

const AdminHomePage = lazy(() => import('./AdminHomePage'));

export default function HomePage() {
  const { session } = useAuth();
  if (!session) return null;
  if (session.user.rol === 'ADMIN' || session.user.rol === 'SUBDIRECCION') return <Suspense fallback={<LoadingState message="Cargando inicio…" />}>
    <AdminHomePage key={`${session.user.id}:${session.user.rol}:${session.user.nivel_asignado}:${session.expiresAt}`} />
  </Suspense>;
  if (session.user.rol === 'REGISTRADOR') return <RegistrarHomePage key={`${session.user.id}:${session.expiresAt}`} />;
  return (
    <div>
      <p className="text-sm font-medium text-institutional-800">I.E. Enrique Paillardelle · Tacna</p>
      <h1 className="mt-3 break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        Bienvenido/a, {session.user.nombres}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
        Este es tu espacio de trabajo en Paillardelle Asistencia.
        Desde aquí accederás a las herramientas disponibles para tu cuenta.
      </p>
      <section aria-labelledby="account-title" className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-5 w-1 rounded-full bg-accent-yellow" />
          <h2 id="account-title" className="text-lg font-semibold">Tu cuenta</h2>
        </div>
        <dl className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Nombre completo</dt><dd className="mt-2 break-words font-medium">{session.user.nombres} {session.user.apellidos}</dd></div>
          <div><dt className="text-slate-500">Usuario</dt><dd className="mt-2 break-words font-medium">{session.user.usuario}</dd></div>
        </dl>
      </section>
    </div>
  );
}
