import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../../shared/components/Button';
import { StudentProfileContext } from './StudentProfileContext';
import StudentProfile from './StudentProfile';
import type { ProfileSelection } from './profile.types';
import { X } from 'lucide-react';

function ProfileHost({ children, compact }: { children: ReactNode; compact: boolean }) {
  const [selection, setSelection] = useState<ProfileSelection | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false), busy = useRef(false);
  function setBusy(value: boolean) { busy.current = value; setPhoneBusy(value); }
  function close() { if (!busy.current) setSelection(null); }
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selection && !dialog.current?.open) dialog.current?.showModal();
    if (!selection && dialog.current?.open) dialog.current.close();
  }, [selection]);
  return <StudentProfileContext.Provider value={setSelection}>
    {children}
    <dialog ref={dialog} aria-label="Perfil individual del estudiante" onCancel={e => { e.preventDefault(); close(); }}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1rem)] ${compact ? 'max-w-sm' : 'max-w-4xl'} overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-slate-950/50 sm:p-6`}>
      {selection && <div className="min-w-0 space-y-4"><header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-xl font-bold">{compact ? 'Perfil del estudiante' : 'Perfil individual'}</h2>
        <Button variant="secondary" disabled={phoneBusy} aria-label={compact ? 'Cerrar perfil' : undefined} className="shrink-0" onClick={close}>
          {compact ? <X aria-hidden="true" className="size-5" /> : 'Volver'}</Button>
      </header>
      <StudentProfile key={`${selection.studentId}:${selection.yearId ?? ''}:${selection.month ?? ''}`} selection={selection} compact={compact} phoneBusy={phoneBusy} onPhoneBusy={setBusy} /></div>}
    </dialog>
  </StudentProfileContext.Provider>;
}
export default function StudentProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const restricted = session?.user.rol === 'ADMIN' && session.user.debe_cambiar_password;
  return session && !restricted ? <ProfileHost key={`${session.user.id}:${session.user.rol}:${session.expiresAt}`} compact={session.user.rol === 'REGISTRADOR'}>{children}</ProfileHost> : children;
}
