import { useEffect, useId, useRef, useState } from 'react';
import Button from '../../../shared/components/Button';
import FormField from '../../../shared/components/FormField';
import type { AttendanceDetail, AttendanceEntry } from '../asistencias.types';
import { correctionLabel, correctionRequest, correctionStates } from './supervisionCorrection';

type Props = { data: AttendanceDetail; row: AttendanceEntry; busy: boolean;
  onCancel: () => void; onSave: (state: string, reason: string) => Promise<void> };

export default function SupervisionCorrectionDialog({ data, row, busy, onCancel, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const title = useId(), select = useId();
  const [state, setState] = useState(''), [reason, setReason] = useState(''), [confirm, setConfirm] = useState(false);
  let error = '';
  try { correctionRequest(data, row.asistencia_id, state, reason); }
  catch (failure) { error = (failure as Error).message; }
  useEffect(() => {
    const element = dialog.current!, opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal(); cancel.current?.focus(); document.body.style.overflow = 'hidden';
    return () => {
      element.close(); document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={title} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-institutional-950 shadow-xl backdrop:bg-institutional-950/50 sm:p-6">
    <h2 id={title} className="text-xl font-bold">{confirm ? 'Confirmar corrección' : 'Corregir asistencia'}</h2>
    <p className="mt-3 break-words font-medium">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}</p>
    <p className="mt-3">Estado actual: <strong>{correctionLabel(row.estado)}</strong></p>
    {confirm ? <div className="mt-4 space-y-3">
      <p>Nuevo estado: <strong>{correctionLabel(state as AttendanceEntry['estado'])}</strong></p>
      {data.sesion.estado === 'CERRADA' && <p className="break-words">Motivo: {reason.trim()}</p>}
      {state === 'PENDIENTE' && <p>La marca se anulará y quedará sin marcar. Se conservará su historial.</p>}
      <p>La corrección se enviará al guardar. {data.sesion.estado === 'CERRADA' && 'La sesión permanecerá cerrada.'}</p>
    </div> : <div className="mt-4 space-y-4">
      <label htmlFor={select} className="block text-sm font-semibold">Nuevo estado</label>
      <select id={select} value={state} disabled={busy} onChange={event => setState(event.target.value)}
        className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base">
        <option value="">Selecciona un estado</option>
        {correctionStates.map(([value, label]) => <option key={value} value={value} disabled={row.estado === value}>{label}</option>)}
      </select>
      {data.sesion.estado === 'CERRADA' && <FormField label="Motivo de corrección" value={reason} required disabled={busy}
        onChange={event => setReason(event.target.value)} hint="Obligatorio después del cierre. Máximo 500 caracteres." />}
      {state && error && <p role="alert" className="text-sm text-accent-red">{error}</p>}
    </div>}
    {busy && <p role="status" className="mt-4">Guardando corrección…</p>}
    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
      <Button ref={cancel} variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button>
      {confirm ? <>
        <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>Volver a editar</Button>
        <Button disabled={busy || Boolean(error)} onClick={() => void onSave(state, reason)}>Confirmar y guardar</Button>
      </> : <Button disabled={Boolean(error) || busy} onClick={() => setConfirm(true)}>Revisar corrección</Button>}
    </div>
  </dialog>;
}
