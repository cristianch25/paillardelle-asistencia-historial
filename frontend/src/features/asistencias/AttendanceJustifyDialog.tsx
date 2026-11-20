import { useEffect, useId, useRef, useState } from 'react';
import Button from '../../shared/components/Button';
import FormField from '../../shared/components/FormField';
import { justificationError } from './attendanceDraft';

type Props = {
  isOpen: boolean;
  initialReason?: string;
  state: string;
  studentName: string;
  onSave: (reason: string) => void;
  onCancel: () => void;
};

export default function AttendanceJustifyDialog({
  isOpen,
  initialReason = '',
  state,
  studentName,
  onSave,
  onCancel,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [reason, setReason] = useState(initialReason);
  const [error, setError] = useState('');

  useEffect(() => {
    setReason(initialReason);
    setError('');
  }, [initialReason, isOpen]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
    } else if (!isOpen && el.open) {
      el.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleSave() {
    const trimmed = reason.trim();
    const err = justificationError(trimmed);
    if (err) {
      setError(err);
      return;
    }
    onSave(trimmed);
  }

  const label = state === 'TARDANZA' ? 'tardanza' : 'falta';

  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      onCancel={e => { e.preventDefault(); onCancel(); }}
      className="fixed inset-0 z-50 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/60"
    >
      <h3 id={title} className="text-lg font-bold text-institutional-950">
        Justificar {label}
      </h3>
      <p className="text-xs text-slate-600 break-words font-medium">
        {studentName}
      </p>
      <FormField
        label="Motivo de la justificación"
        required
        value={reason}
        maxLength={500}
        hint="Obligatorio si se justifica. Máximo 500 caracteres."
        onChange={e => {
          setReason(e.target.value);
          if (error) setError(justificationError(e.target.value));
        }}
        error={error}
        placeholder="Ej. Cita médica, motivos de salud..."
      />
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={!reason.trim()} onClick={handleSave}>
          Aceptar motivo
        </Button>
      </div>
    </dialog>
  );
}
