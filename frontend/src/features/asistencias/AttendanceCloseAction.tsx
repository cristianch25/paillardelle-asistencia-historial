import { useEffect, useId, useRef, useState } from 'react';
import Button from '../../shared/components/Button';

type Props = { available: boolean; pending: number; dirty: number; disabled: boolean; onClose: (discard: boolean) => Promise<void> };

export default function AttendanceCloseAction({ available, pending, dirty, disabled, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const title = useId(), description = useId();
  useEffect(() => {
    if (!open || disabled || !available) return;
    const element = dialog.current;
    if (!element) return;
    const opener = trigger.current;
    const overflow = document.body.style.overflow;
    element.showModal(); cancel.current?.focus(); document.body.style.overflow = 'hidden';
    return () => {
      element.close(); document.body.style.overflow = overflow;
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
      else document.querySelector<HTMLElement>('#main-content')?.focus();
    };
  }, [open, disabled, available]);
  function dismiss() { setOpen(false); setDiscard(false); }
  if (!available) return null;
  return (
    <section aria-label="Cierre de asistencia" className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-sm text-slate-600">Cuando termines el registro ordinario de esta sección y fecha, puedes cerrar la asistencia.</p>
      <Button ref={trigger} variant="secondary" className="w-full sm:w-auto" disabled={disabled}
        onClick={() => { setDiscard(false); setOpen(true); }}>Cerrar asistencia</Button>
      <dialog ref={dialog} aria-labelledby={title} aria-describedby={description}
        onCancel={event => { event.preventDefault(); dismiss(); }}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-institutional-950 shadow-xl backdrop:bg-institutional-950/50 sm:p-6">
        <h2 id={title} className="text-lg font-bold">¿Cerrar asistencia?</h2>
        <p id={description} className="mt-3 text-sm leading-6">Al cerrar, finalizarás el registro ordinario de esta sección y fecha. Las correcciones posteriores requerirán un motivo.</p>
        <p className="mt-3 text-sm">Hay {pending} {pending === 1 ? 'estudiante' : 'estudiantes'} sin marcar según los datos confirmados. Si cierras la asistencia, permanecerán pendientes.</p>
        {dirty > 0 && <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
          <p>Tienes {dirty} marcas sin guardar. Vuelve y guarda para conservarlas; no se guardarán automáticamente.</p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" checked={discard} onChange={event => setDiscard(event.target.checked)} className="size-5 shrink-0" />
            Confirmo descartar mis cambios sin guardar y cerrar con los datos confirmados.
          </label>
        </div>}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button ref={cancel} variant="secondary" className="flex-1" onClick={dismiss}>{dirty ? 'Volver y guardar' : 'Cancelar'}</Button>
          <Button className="flex-1" disabled={disabled || (dirty > 0 && !discard)}
            onClick={() => { dismiss(); void onClose(discard); }}>Confirmar cierre</Button>
        </div>
      </dialog>
    </section>
  );
}
