import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { AuthContext, useAuth } from '../../src/features/auth/AuthContext';
import NavigationProtectionProvider from '../../src/shared/navigation/NavigationProtectionProvider';
import SeccionSelectionProvider from '../../src/features/organizacion-escolar/secciones/SeccionSelectionProvider';
import { useSectionSelection } from '../../src/features/organizacion-escolar/secciones/SeccionSelectionContext';
import AsistenciaDiariaPage from '../../src/features/asistencias/AsistenciaDiariaPage';
import { connectHttpSession, httpClient } from '../../src/shared/api/httpClient';
import { selection } from './attendanceFixture.mjs';
import { attendanceMock } from './attendanceMock.mjs';
import '../../src/app/styles.css';

const { controls, adapter } = attendanceMock();
window.attendanceTest = controls;
window.confirm = message => { controls.prompts.push(message); return controls.confirmAnswer; };
httpClient.defaults.adapter = adapter;
const controller = new AbortController();
connectHttpSession({ current: () => controls.account ? { token: `simulado-${controls.account}`, signal: controller.signal } : null,
  unauthorized: () => { controls.unauthorized = true; controls.account = null; render(); } });

function SeedSelection() {
  const { select, clear } = useSectionSelection();
  useEffect(() => { void select(structuredClone(selection)); }, [select]);
  controls.selectSection = select;
  controls.clearSection = clear;
  return <main className="mx-auto max-w-6xl p-4 sm:p-8"><Outlet /></main>;
}
function Shell() {
  const { session } = useAuth();
  return <NavigationProtectionProvider enabled={Boolean(session)}><SeccionSelectionProvider><SeedSelection /></SeccionSelectionProvider></NavigationProtectionProvider>;
}
const router = createMemoryRouter([{ element: <Shell />, children: [
  { path: '/secciones/asistencia', element: <AsistenciaDiariaPage /> },
  { path: '/secciones', element: <p>Secciones</p> },
] }], { initialEntries: [{ pathname: '/secciones/asistencia', state: { fecha: '2026-11-13' } }] });
function render() {
  root.render(<AuthContext.Provider value={{ session: controls.account ? { user: { id: controls.account, rol: 'REGISTRADOR' } } : null }}>
    <RouterProvider router={router} />
  </AuthContext.Provider>);
}
const root = createRoot(document.getElementById('root'));
controls.render = render;
render();
