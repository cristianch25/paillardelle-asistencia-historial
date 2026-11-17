import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from 'react-router';
import LoginPage from '../features/auth/LoginPage';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import AppLayout from './layout/AppLayout';
import HomePage from '../features/inicio/HomePage';
import SeccionesPage from '../features/organizacion-escolar/secciones/SeccionesPage';
import SeccionSelectionProvider from '../features/organizacion-escolar/secciones/SeccionSelectionProvider';
import EstudiantesSeccionPage from '../features/organizacion-escolar/secciones/EstudiantesSeccionPage';
import AsistenciaDiariaPage from '../features/asistencias/AsistenciaDiariaPage';
import NavigationShell from './NavigationShell';
import SupervisionPage from '../features/asistencias/supervision/SupervisionPage';
import SupervisionWorkspace from '../features/asistencias/supervision/SupervisionWorkspace';
import SupervisionDetailPage from '../features/asistencias/supervision/SupervisionDetailPage';
import AttendanceManagementPage from '../features/asistencias/gestion/AttendanceManagementPage';

export const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<NavigationShell />}>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/usuarios" lazy={async () => ({ Component: (await import('../features/usuarios/UsersPage')).default })} />
        <Route path="/asistencias/supervision" element={<SupervisionWorkspace />}>
          <Route index element={<SupervisionPage />} />
          <Route path=":sesionId" element={<SupervisionDetailPage />} />
        </Route>
        <Route path="/asistencias/gestion" element={<SupervisionWorkspace />}>
          <Route index element={<AttendanceManagementPage />} />
        </Route>
      </Route>
      <Route element={<SeccionSelectionProvider><AppLayout /></SeccionSelectionProvider>}>
        <Route path="/inicio" element={<HomePage />} />
        <Route path="/secciones" element={<SeccionesPage />} />
        <Route path="/secciones/estudiantes" element={<EstudiantesSeccionPage />} />
        <Route path="/secciones/asistencia" element={<AsistenciaDiariaPage />} />
      </Route>
      <Route path="/sesion" element={<Navigate to="/inicio" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Route>,
));
