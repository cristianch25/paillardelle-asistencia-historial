import { Outlet } from 'react-router';
import { useAuth } from '../features/auth/AuthContext';
import NavigationProtectionProvider from '../shared/navigation/NavigationProtectionProvider';

export default function NavigationShell() {
  const { session } = useAuth();
  const technical = session?.user.rol === 'SUPERUSUARIO';
  return <NavigationProtectionProvider enabled={Boolean(session)} activity={technical ? 'cuentas' : undefined}
    continueLabel={technical ? 'Continuar aquí' : undefined}><Outlet /></NavigationProtectionProvider>;
}
