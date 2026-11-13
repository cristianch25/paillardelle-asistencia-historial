import { Menu, UserRound } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { roleLabels } from './navigation';

type AppHeaderProps = { onOpenMenu: () => void; menuOpen: boolean };

export default function AppHeader({ onOpenMenu, menuOpen }: AppHeaderProps) {
  const { session } = useAuth();
  if (!session) return null;
  return (
    <header className="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8 lg:px-6 xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenMenu} aria-label="Abrir menú principal"
          aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded={menuOpen}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-institutional-800 hover:bg-sky-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 lg:hidden">
          <Menu aria-hidden="true" className="size-6" />
        </button>
        <div>
          <p className="text-sm font-semibold text-institutional-950 lg:text-base">Inicio</p>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block lg:text-sm lg:text-slate-600">Paillardelle Asistencia</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <UserRound aria-hidden="true" className="hidden size-10 shrink-0 rounded-full bg-sky-soft p-2.5 text-institutional-800 sm:block" />
        <div className="min-w-0 text-right sm:text-left">
          <p className="max-w-44 truncate text-sm font-semibold sm:max-w-80 lg:text-base" title={`${session.user.nombres} ${session.user.apellidos}`}>
            {session.user.nombres} {session.user.apellidos}
          </p>
          <p className="mt-1 text-xs text-slate-600 lg:text-sm">{roleLabels[session.user.rol]}</p>
        </div>
      </div>
    </header>
  );
}
