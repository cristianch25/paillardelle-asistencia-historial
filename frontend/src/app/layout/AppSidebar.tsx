import { useState } from 'react';
import { NavLink } from 'react-router';
import { KeyRound, LogOut, X } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { navigationFor } from './navigation';
import { primaryLevelLabel, userIdentityLabel } from '../../features/auth/userPresentation';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';
import ChangePasswordDialog from '../../features/auth/ChangePasswordDialog';

type AppSidebarProps = { onClose?: () => void };

export default function AppSidebar({ onClose }: AppSidebarProps) {
  const { session, signOut } = useAuth();
  const { request } = useNavigationProtection();
  const [showChangePassword, setShowChangePassword] = useState(false);
  if (!session) return null;
  return (
    <div className="flex h-full flex-col bg-sidebar text-white">
      <div className="flex items-start justify-between gap-2 px-6 pb-7 pt-7">
        <div>
          <img src="/images/escudo-paillardelle.png" alt="Escudo de la I.E. Enrique Paillardelle"
            width={553} height={555} className="mb-5 h-auto w-16 object-contain lg:w-20" />
          <p className="text-xl font-bold tracking-tight">Paillardelle</p>
          <p className="mt-1 text-sm text-sidebar-muted lg:text-base">Asistencia</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Cerrar menú"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <X aria-hidden="true" className="size-5" />
        </button>}
      </div>
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3">
        {navigationFor(session.user.rol).map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} end={path !== '/secciones' && path !== '/asistencias' && !(session.user.rol === 'ADMIN' && path === '/asistencias/supervision')} onClick={onClose}
            className={({ isActive }) => `mb-1 flex min-h-12 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:text-base ${isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-muted hover:bg-sidebar-active hover:text-white'}`}>
            <Icon aria-hidden="true" className="size-5 shrink-0" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="mx-5 border-t border-white/20 py-5">
        <p className="text-xs font-medium text-sidebar-muted lg:text-sm">{userIdentityLabel(session.user)}</p>
        {primaryLevelLabel(session.user) && <p className="mt-1 text-xs text-sidebar-muted lg:text-sm">{primaryLevelLabel(session.user)}</p>}
        <button type="button" onClick={() => setShowChangePassword(true)}
          className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-sm font-medium hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:text-base">
          <KeyRound aria-hidden="true" className="size-5" />Cambiar contraseña
        </button>
        <button type="button" onClick={() => { onClose?.(); void request(signOut); }}
          className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-sm font-medium hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:text-base">
          <LogOut aria-hidden="true" className="size-5" />Cerrar sesión
        </button>
        <p className="mt-5 text-xs leading-5 text-sidebar-muted lg:text-sm lg:leading-6">I.E. Enrique Paillardelle<br />Tacna, Perú</p>
      </div>
      {showChangePassword && (
        <ChangePasswordDialog onClose={() => { setShowChangePassword(false); onClose?.(); }} />
      )}
    </div>
  );
}
