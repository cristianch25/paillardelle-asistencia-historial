import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import MisSeccionesPage from '../organizacion-escolar/secciones/MisSeccionesPage';
import AsistenciaDiariaPage from './AsistenciaDiariaPage';

export default function RegistradorAttendancePage({ daily = false }: { daily?: boolean }) {
  const { session } = useAuth();
  if (session?.user.rol !== 'REGISTRADOR') return <Navigate to="/inicio" replace />;
  return daily ? <AsistenciaDiariaPage /> : <MisSeccionesPage attendanceMode />;
}
