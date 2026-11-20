import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import AuthInitialization from './AuthInitialization';

export default function ProtectedRoute() {
  const { session, initialization } = useAuth();
  const { pathname } = useLocation();
  if (initialization === 'checking' || initialization === 'error') return <AuthInitialization />;
  // El rol técnico no monta páginas ni proveedores académicos, incluso con URL directa.
  if (session?.user.rol === 'SUPERUSUARIO' && pathname.replace(/\/+$/, '') !== '/administradores') {
    return <Navigate to="/administradores" replace />;
  }
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
