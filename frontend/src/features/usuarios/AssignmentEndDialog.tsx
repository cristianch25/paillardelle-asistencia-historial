import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/Button';
import { formatCivilDate, peruToday } from '../../shared/dates/civilDate';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import type { SectionAssignment } from '../organizacion-escolar/secciones/sectionStaff.api';

export default function AssignmentEndDialog({ assignment, label, busy, onSave, onClose }: {
  assignment: SectionAssignment; label: string; busy: boolean; onSave: (date: string) => Promise<boolean>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false);
  const next = new Date(`${assignment.fecha_inicio}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const earliest = [next.toISOString().slice(0, 10), peruToday()].sort().at(-1)!;
  const [effective, setEffective] = useState(earliest), [review, setReview] = useState(false);
  const max = assignment.fecha_fin ? new Date(`${assignment.fecha_fin}T00:00:00Z`) : null;
  if (max) max.setUTCDate(max.getUTCDate() + 1);
  useUnsavedChanges(`assignment-end:${assignment.id}`, true, busy);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  async function submit() {
    if (busy || running.current) return;
    if (!review) { setReview(true); return; }
    running.current = true;
    try { if (await onSave(effective)) onClose(); } finally { running.current = false; }
  }
  return <dialog ref={dialog} aria-labelledby="assignment-end-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
    <h2 id="assignment-end-title" className="text-xl font-bold">Finalizar asignación</h2>
    <p className="break-words">{label}</p>
    <p className="text-sm text-slate-600">Inicio: {formatCivilDate(assignment.fecha_inicio)}. No se puede retirar el acceso el mismo día de inicio con el modelo actual. Las finalizaciones retroactivas quedan fuera de esta etapa.</p>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="block text-sm font-semibold">Retirar acceso desde<input type="date" required min={earliest} max={max?.toISOString().slice(0, 10)} value={effective} disabled={busy}
        onChange={event => { setEffective(event.target.value); setReview(false); }} className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2" /></label>
      {review && <p role="status">Desde el {formatCivilDate(effective)} perderá el acceso operativo a esta sección, salvo que tenga otra asignación vigente. Se conservarán la cuenta, los registros históricos y la auditoría.</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>{busy ? 'Finalizando…' : review ? 'Confirmar finalización' : 'Revisar finalización'}</Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button></div>
    </form>
  </dialog>;
}
