import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import AuthInitialization from './AuthInitialization';
import RequiredPasswordChange from './RequiredPasswordChange';

export default function ProtectedRoute() {
  const { session, initialization } = useAuth();
  const { pathname } = useLocation();
  if (initialization === 'checking' || initialization === 'error') return <AuthInitialization />;
  if (session?.user.rol === 'ADMIN' && session.user.debe_cambiar_password) return <RequiredPasswordChange />;
  // El rol técnico no monta páginas ni proveedores académicos, incluso con URL directa.
  if (session?.user.rol === 'SUPERUSUARIO' && !['/administradores', '/seguridad'].includes(pathname.replace(/\/+$/, ''))) {
    return <Navigate to="/administradores" replace />;
  }
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
