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
import RegistradorAttendancePage from '../features/asistencias/RegistradorAttendancePage';

export const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<NavigationShell />}>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route path="/administradores" lazy={async () => ({ Component: (await import('../features/usuarios/AdminAccountsPage')).default })} />
        <Route path="/seguridad" lazy={async () => ({ Component: (await import('../features/seguridad/SecurityPage')).default })} />
        <Route path="/usuarios" lazy={async () => ({ Component: (await import('../features/usuarios/UsersPage')).default })} />
        <Route path="/auditoria" lazy={async () => ({ Component: (await import('../features/auditoria/AuditPage')).default })} />
        <Route path="/anios-escolares" lazy={async () => ({ Component: (await import('../features/organizacion-escolar/anios-escolares/SchoolYearsPage')).default })} />
        <Route path="/asignaciones-docentes" lazy={async () => ({ Component: (await import('../features/usuarios/TeacherAssignmentsPage')).default })} />
        <Route path="/reportes" lazy={async () => ({ Component: (await import('../features/reportes/MonthlyReportPage')).default })} />
        <Route path="/estadisticas" lazy={async () => ({ Component: (await import('../features/estadisticas/StatisticsPage')).default })} />
        <Route path="/calendario" lazy={async () => ({ Component: (await import('../features/organizacion-escolar/calendario-lectivo/SchoolCalendarPage')).default })} />
        <Route path="/secciones/importar" lazy={async () => ({ Component: (await import('../features/importaciones/ImportPadronPage')).default })} />
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
        <Route path="/asistencias" element={<RegistradorAttendancePage />} />
        <Route path="/asistencias/diaria" element={<RegistradorAttendancePage daily />} />
        <Route path="/secciones/estudiantes" element={<EstudiantesSeccionPage />} />
        <Route path="/secciones/asistencia" element={<AsistenciaDiariaPage />} />
      </Route>
      <Route path="/sesion" element={<Navigate to="/inicio" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Route>,
));
