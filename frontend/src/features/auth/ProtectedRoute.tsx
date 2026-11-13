import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthContext';

export default function ProtectedRoute() {
  const { session } = useAuth();
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
