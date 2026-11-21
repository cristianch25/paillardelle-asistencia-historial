import { Navigate } from 'react-router';
import InstitutionalBrand from '../../shared/components/InstitutionalBrand';
import { useAuth } from './AuthContext';
import LoginForm from './LoginForm';
import AuthInitialization from './AuthInitialization';

export default function LoginPage() {
  const { session, notice, initialization } = useAuth();
  if (initialization === 'checking' || initialization === 'error') return <AuthInitialization />;
  if (session) return <Navigate to={session.user.rol === 'SUPERUSUARIO' ? '/administradores' : '/inicio'} replace />;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-5 sm:py-10">
      <section aria-labelledby="login-title" className="w-full min-w-0 max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-9 [&_img]:w-[10.6875rem] [&_img]:max-w-full [&_img+p]:mt-3">
        <InstitutionalBrand />
        <h1 id="login-title" className="mt-6 text-xl font-semibold">Iniciar sesión</h1>
        <p className="mb-6 mt-1.5 text-sm leading-6 text-slate-600">Ingresa con tu cuenta institucional.</p>
        {notice && <p role="status" className="mb-5 rounded-lg bg-sky-soft p-3 text-sm leading-6">{notice}</p>}
        <LoginForm />
      </section>
    </main>
  );
}
