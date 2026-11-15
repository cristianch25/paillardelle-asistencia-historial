import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import AuthProvider from '../features/auth/AuthProvider';
import LoginPage from '../features/auth/LoginPage';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import AppLayout from './layout/AppLayout';
import HomePage from '../features/inicio/HomePage';
import SeccionesPage from '../features/organizacion-escolar/secciones/SeccionesPage';
import SeccionSelectionProvider from '../features/organizacion-escolar/secciones/SeccionSelectionProvider';
import EstudiantesSeccionPage from '../features/organizacion-escolar/secciones/EstudiantesSeccionPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<SeccionSelectionProvider><AppLayout /></SeccionSelectionProvider>}>
              <Route path="/inicio" element={<HomePage />} />
              <Route path="/secciones" element={<SeccionesPage />} />
              <Route path="/secciones/estudiantes" element={<EstudiantesSeccionPage />} />
            </Route>
            <Route path="/sesion" element={<Navigate to="/inicio" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
