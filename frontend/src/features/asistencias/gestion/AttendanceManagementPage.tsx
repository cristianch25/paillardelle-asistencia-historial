import { Navigate } from 'react-router';

// Compatibilidad para enlaces anteriores, dentro del workspace autorizado.
export default function AttendanceManagementPage() {
  return <Navigate to="/asistencias/supervision" replace />;
}
