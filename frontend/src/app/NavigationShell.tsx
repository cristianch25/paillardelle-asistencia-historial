import { Outlet } from 'react-router';
import { useAuth } from '../features/auth/AuthContext';
import NavigationProtectionProvider from '../shared/navigation/NavigationProtectionProvider';

export default function NavigationShell() {
  const { session } = useAuth();
  return <NavigationProtectionProvider enabled={Boolean(session)}><Outlet /></NavigationProtectionProvider>;
}
