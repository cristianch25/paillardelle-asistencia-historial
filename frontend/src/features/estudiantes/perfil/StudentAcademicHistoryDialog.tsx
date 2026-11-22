import { useEffect, useId, useRef } from 'react';
import Button from '../../../shared/components/Button';
import StudentProfile from './StudentProfile';
import type { ProfileSelection } from './profile.types';

export default function StudentAcademicHistoryDialog({ selection, onClose }: {
  selection: ProfileSelection; onClose: () => void;
}) {
  const element = useRef<HTMLDialogElement>(null), title = useId();
  useEffect(() => {
    const dialog = element.current!, opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={element} aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-institutional-950 shadow-xl backdrop:bg-institutional-950/50 sm:p-6">
    <header className="flex items-start justify-between gap-3">
      <h2 id={title} className="min-w-0 text-xl font-bold">Historial de asistencia</h2>
      <Button variant="secondary" className="shrink-0" onClick={onClose}>Cerrar</Button>
    </header>
    <StudentProfile selection={selection} historyOnly />
  </dialog>;
}
