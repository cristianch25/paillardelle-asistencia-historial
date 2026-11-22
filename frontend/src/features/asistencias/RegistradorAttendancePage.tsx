import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import AsistenciaDiariaPage from './AsistenciaDiariaPage';

export default function RegistradorAttendancePage({ daily = false }: { daily?: boolean }) {
  const { session } = useAuth();
  const location = useLocation();
  if (session?.user.rol !== 'REGISTRADOR') return <Navigate to="/inicio" replace />;
  // El enlace antiguo conserva filtros, estado y contexto compartido.
  return daily ? <AsistenciaDiariaPage /> : <Navigate to={`/secciones${location.search}`} state={location.state} replace />;
}
