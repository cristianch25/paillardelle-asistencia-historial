import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthContext';
import AuthInitialization from './AuthInitialization';

export default function ProtectedRoute() {
  const { session, initialization } = useAuth();
  if (initialization === 'checking' || initialization === 'error') return <AuthInitialization />;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
