import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import { useAuth } from '../../features/auth/AuthContext';

export default function AppLayout() {
  const { notice } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const location = useLocation();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (menuOpen) element.showModal();
    else element.close();
    const previousOverflow = document.body.style.overflow;
    if (menuOpen) document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => { main.current?.focus(); }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-surface">
      <a href="#main-content" onClick={event => { event.preventDefault(); main.current?.focus(); main.current?.scrollIntoView({ block: 'start' }); }}
        className="sr-only z-50 rounded-lg bg-white p-3 text-institutional-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Ir al contenido principal
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block xl:w-72" aria-label="Menú lateral">
        <AppSidebar />
      </aside>
      <dialog ref={dialog} id="mobile-navigation" aria-label="Menú principal"
        onClose={() => setMenuOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[calc(100%-2rem)] border-0 bg-sidebar p-0 text-white backdrop:bg-institutional-950/50">
        <AppSidebar onClose={() => setMenuOpen(false)} />
      </dialog>
      <div className="lg:pl-64 xl:pl-72">
        <AppHeader onOpenMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
        <main ref={main} id="main-content" tabIndex={-1} className="mr-auto w-full max-w-[100rem] px-5 py-8 outline-none sm:px-8 lg:px-6 lg:py-10 xl:px-8">
          {notice && <p role="status" className="mb-4 rounded-lg bg-sky-soft p-3 text-sm">{notice}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
