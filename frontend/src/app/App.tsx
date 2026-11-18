import { RouterProvider } from 'react-router';
import AuthProvider from '../features/auth/AuthProvider';
import { router } from './router';
import StudentProfileProvider from '../features/estudiantes/perfil/StudentProfileProvider';

export default function App() {
  return <AuthProvider><StudentProfileProvider><RouterProvider router={router} /></StudentProfileProvider></AuthProvider>;
}
