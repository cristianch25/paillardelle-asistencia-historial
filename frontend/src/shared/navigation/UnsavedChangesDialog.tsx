import { useEffect, useId, useRef } from 'react';
import Button from '../components/Button';

type Props = { open: boolean; busy: boolean; dirty: boolean; onCancel: () => void; onConfirm: () => void };
export default function UnsavedChangesDialog({ open, busy, dirty, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const title = useId(), description = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal(); cancel.current?.focus(); document.body.style.overflow = 'hidden';
    return () => {
      element.close(); document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus();
      else document.querySelector<HTMLElement>('#main-content')?.focus();
    };
  }, [open]);
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
      <h2 id={title} className="text-lg font-bold">{dirty ? '¿Salir sin guardar los cambios?' : 'Operación de asistencia en curso'}</h2>
      <p id={description} className="mt-3 text-sm leading-6">
        {dirty && 'Tienes cambios de asistencia pendientes. Si continúas, se perderán.'}
        {!dirty && 'Espera a que termine la operación de asistencia antes de salir.'}
      </p>
      {busy && <p role="status" className="mt-3 text-sm font-medium">Espera a que termine la operación de asistencia y se compruebe su resultado.</p>}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button ref={cancel} className="flex-1" onClick={onCancel}>Continuar registrando</Button>
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={onConfirm}>{dirty ? 'Salir sin guardar' : 'Salir de todos modos'}</Button>
      </div>
    </dialog>
  );
}
