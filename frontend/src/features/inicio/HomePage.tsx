import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../../app/layout/navigation';

export default function HomePage() {
  const { session } = useAuth();
  if (!session) return null;
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
        <dl className="mt-6 grid gap-6 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <div><dt className="text-slate-500">Nombre completo</dt><dd className="mt-2 break-words font-medium">{session.user.nombres} {session.user.apellidos}</dd></div>
          <div><dt className="text-slate-500">Usuario</dt><dd className="mt-2 break-words font-medium">{session.user.usuario}</dd></div>
          <div><dt className="text-slate-500">Rol</dt><dd className="mt-2 font-medium">{roleLabels[session.user.rol]}</dd></div>
        </dl>
      </section>
      <p className="mt-6 max-w-2xl text-sm leading-6 text-slate-600">
        Los módulos del sistema se incorporarán progresivamente. El menú mostrará las funciones que estén disponibles para tu cuenta.
      </p>
    </div>
  );
}
