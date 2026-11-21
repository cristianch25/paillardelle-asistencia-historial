import { useAuth } from './AuthContext';
import ChangePasswordDialog from './ChangePasswordDialog';
import InstitutionalBrand from '../../shared/components/InstitutionalBrand';

export default function RequiredPasswordChange() {
  const { signOut, verifySession } = useAuth();
  return <main id="main-content" className="flex min-h-dvh items-center justify-center p-5">
    <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
      <InstitutionalBrand />
      <h1 className="mt-6 text-xl font-bold">Cambio obligatorio de contraseña</h1>
      <p className="mt-3 text-sm text-slate-600">Cambia tu contraseña inicial o temporal para acceder a las funciones institucionales.</p>
    </section>
    <ChangePasswordDialog required onClose={signOut} onVerified={verifySession} />
  </main>;
}
