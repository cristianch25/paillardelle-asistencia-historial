import { useEffect, useId, useRef } from 'react';
import Button from '../components/Button';

type Props = { open: boolean; busy: boolean; dirty: boolean; onCancel: () => void; onConfirm: () => void; activity?: string; continueLabel?: string;
  confirmation?: { title: string; message: string; cancelLabel?: string; confirmLabel?: string } };
export default function UnsavedChangesDialog({ open, busy, dirty, onCancel, onConfirm, activity = 'asistencia', continueLabel = 'Continuar registrando', confirmation }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const title = useId(), description = useId();
  const confirmationMode = Boolean(confirmation);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal(); cancel.current?.focus(); document.body.style.overflow = 'hidden';
    return () => {
      element.close(); document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length && (!confirmationMode || !previousFocus.matches(':disabled'))) previousFocus.focus();
      else document.querySelector<HTMLElement>('#main-content')?.focus();
    };
  }, [open, confirmationMode]);
  return (
    <dialog ref={dialog} aria-labelledby={title} aria-describedby={description}
      onCancel={event => { event.preventDefault(); onCancel(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-institutional-950 shadow-xl backdrop:bg-institutional-950/50 sm:p-6">
      <h2 id={title} className="text-lg font-bold">{confirmation?.title ?? (dirty ? '¿Salir sin guardar los cambios?' : `Operación de ${activity} en curso`)}</h2>
      <p id={description} className="mt-3 text-sm leading-6">
        {confirmation ? confirmation.message : dirty ? `Tienes cambios de ${activity} pendientes. Si continúas, se perderán.`
          : `Espera a que termine la operación de ${activity} antes de salir.`}
      </p>
      {busy && <p role="status" className="mt-3 text-sm font-medium">Espera a que termine la operación de {activity} y se compruebe su resultado.</p>}
      <div className={confirmationMode ? 'mt-5 flex flex-wrap gap-3 [&>button]:min-w-28' : 'mt-5 flex flex-col gap-3 sm:flex-row'}>
        <Button ref={cancel} variant={confirmation ? 'secondary' : 'primary'} className="flex-1" onClick={onCancel}>{confirmation ? confirmation.cancelLabel ?? 'Cancelar' : continueLabel}</Button>
        <Button variant={confirmation ? 'primary' : 'secondary'} className="flex-1" disabled={busy} onClick={onConfirm}>{confirmation ? confirmation.confirmLabel ?? 'Confirmar' : dirty ? 'Salir sin guardar' : 'Salir de todos modos'}</Button>
      </div>
    </dialog>
  );
}
