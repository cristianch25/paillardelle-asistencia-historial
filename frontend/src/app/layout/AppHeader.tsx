import { Menu, UserRound } from 'lucide-react';
import { useLocation } from 'react-router';
import { useAuth } from '../../features/auth/AuthContext';
import { navigationFor } from './navigation';
import { primaryLevelLabel, userIdentityLabel } from '../../features/auth/userPresentation';

type AppHeaderProps = { onOpenMenu: () => void; menuOpen: boolean };

export default function AppHeader({ onOpenMenu, menuOpen }: AppHeaderProps) {
  const { session } = useAuth();
  const { pathname } = useLocation();
  if (!session) return null;
  const registrador = session.user.rol === 'REGISTRADOR';
  const title = navigationFor(session.user.rol).find(item => item.path === pathname.replace(/\/+$/, ''))?.label ?? 'Paillardelle Asistencia';
  return (
    <header className={`flex items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8 lg:px-6 xl:px-8 ${registrador ? 'min-h-16 gap-3 py-3' : 'min-h-20 gap-4 py-4'}`}>
      <div className={registrador ? 'flex shrink-0 items-center gap-2 sm:gap-3' : 'flex min-w-0 items-center gap-3'}>
        <button type="button" onClick={onOpenMenu} aria-label="Abrir menú principal"
          aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded={menuOpen}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-institutional-800 hover:bg-sky-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 lg:hidden">
          <Menu aria-hidden="true" className="size-6" />
        </button>
        {registrador && <p className="text-sm font-semibold sm:hidden">Paillardelle</p>}
        <div className={registrador ? 'hidden sm:block' : undefined}>
          <p className="text-sm font-semibold text-institutional-950 lg:text-base">{title}</p>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block lg:text-sm lg:text-slate-600">Paillardelle Asistencia</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <UserRound aria-hidden="true" className="hidden size-10 shrink-0 rounded-full bg-sky-soft p-2.5 text-institutional-800 sm:block" />
        <div className="min-w-0 text-right sm:text-left">
          <p className={registrador ? 'break-words text-sm font-semibold [overflow-wrap:anywhere] lg:text-base'
            : 'max-w-44 truncate text-sm font-semibold sm:max-w-80 lg:text-base'} title={`${session.user.nombres} ${session.user.apellidos}`}>
            {session.user.nombres} {session.user.apellidos}
          </p>
          <p className="mt-1 text-xs text-slate-600 lg:text-sm">{userIdentityLabel(session.user)}</p>
          {primaryLevelLabel(session.user) && <p className="mt-1 text-xs text-slate-600 lg:text-sm">{primaryLevelLabel(session.user)}</p>}
        </div>
      </div>
    </header>
  );
}
