import { useAuth } from '../../auth/AuthContext';
import MisSeccionesPage from './MisSeccionesPage';
import AdministrativeSeccionesPage from './AdministrativeSeccionesPage';

export default function SeccionesPage() {
  const { session } = useAuth();
  if (!session) return null;
  if (session.user.rol === 'REGISTRADOR') return <MisSeccionesPage />;
  if (session.user.rol !== 'ADMIN' && session.user.rol !== 'SUBDIRECCION') return null;
  const scope = JSON.stringify([session.user.id, session.user.rol, session.user.nivel_asignado, session.expiresAt]);
  return <AdministrativeSeccionesPage key={scope} />;
}
