import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/Button';
import { formatCivilDate, peruToday, validCivilDate } from '../../shared/dates/civilDate';
import { errorEscritura } from '../../shared/api/apiError';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { withdrawEnrollment } from './matriculas.api';
import type { PadronEntry } from '../organizacion-escolar/secciones/padron.types';

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function EnrollmentWithdrawDialog({
  entry,
  onClose,
  onSuccess,
  onCheckState,
}: {
  entry: PadronEntry;
  onClose: () => void;
  onSuccess: () => void;
  onCheckState?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const running = useRef(false);
  const today = peruToday();
  const earliest = [entry.fecha_ingreso, entry.fecha_inicio].sort().at(-1)!;
  const initialDate = today < earliest ? earliest : today;

  const [fechaRetiro, setFechaRetiro] = useState(initialDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);

  useUnsavedChanges(`enrollment-withdraw:${entry.id}`, true, busy);

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  const studentName = [entry.estudiante.apellido_paterno, entry.estudiante.apellido_materno, entry.estudiante.nombres]
    .filter(Boolean)
    .join(' ');

  const valid = validCivilDate(fechaRetiro);
  const following = valid ? nextDay(fechaRetiro) : '';

  async function submit() {
    if (busy || running.current || uncertain || !valid) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await withdrawEnrollment(entry.id, fechaRetiro, entry.fecha_retiro);
      onSuccess();
      onClose();
    } catch (failure: unknown) {
      const fallo = errorEscritura(failure);
      setError(fallo.mensaje); setUncertain(fallo.incierto);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="withdraw-dialog-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40"
    >
      <h2 id="withdraw-dialog-title" className="text-xl font-bold">Retirar estudiante</h2>
      <p className="break-words font-medium">{studentName}</p>
      {entry.estudiante.codigo_estudiante && (
        <p className="text-sm text-slate-600">Código: {entry.estudiante.codigo_estudiante}</p>
      )}

      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="block text-sm font-semibold">
          Último día en el padrón (inclusive)
          <input
            type="date"
            required
            min={earliest}
            max={today}
            value={fechaRetiro}
            disabled={busy || uncertain}
            onChange={event => { setFechaRetiro(event.target.value); setError(''); }}
            className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2"
          />
        </label>

        {valid && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
            <p>
              El estudiante pertenecerá al padrón hasta el <strong>{formatCivilDate(fechaRetiro)}</strong>.
            </p>
            <p>
              Desde el <strong>{formatCivilDate(following)}</strong> ya no aparecerá en las listas de asistencia posteriores.
            </p>
            <p className="text-xs text-slate-500">
              Sus datos personales y sus asistencias anteriores se mantendrán intactos en el historial.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-200">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" disabled={busy || uncertain || !valid}>
            {busy ? 'Retirando…' : 'Confirmar retiro'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => { if (uncertain) onCheckState?.(); onClose(); }}>
            {uncertain ? 'Comprobar estado' : 'Cancelar'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
