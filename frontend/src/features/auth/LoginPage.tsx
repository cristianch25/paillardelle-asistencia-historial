import { Navigate } from 'react-router';
import InstitutionalBrand from '../../shared/components/InstitutionalBrand';
import { useAuth } from './AuthContext';
import LoginForm from './LoginForm';

export default function LoginPage() {
  const { session, notice } = useAuth();
  if (session) return <Navigate to="/sesion" replace />;
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <section aria-labelledby="login-title" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-9">
        <InstitutionalBrand />
        <h1 id="login-title" className="mt-8 text-xl font-semibold">Iniciar sesión</h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-slate-600">Ingresa con tu cuenta institucional.</p>
        {notice && <p role="status" className="mb-5 rounded-lg bg-sky-soft p-3 text-sm leading-6">{notice}</p>}
        <LoginForm />
        <p className="mt-6 text-xs leading-5 text-slate-600">Por seguridad, al recargar o cerrar esta pestaña deberás iniciar sesión nuevamente.</p>
      </section>
    </main>
  );
}
