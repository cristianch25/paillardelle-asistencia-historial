import { useState } from 'react';
import type { AttendanceDetail } from '../asistencias.types';
import SupervisionCorrectionDialog from './SupervisionCorrectionDialog';
import SupervisionStudentSearch from './SupervisionStudentSearch';

type Props = { data: AttendanceDetail; busy: boolean; onSave: (id: string, state: string) => Promise<void> };
export default function SupervisionCorrectionAction({ data, busy, onSave }: Props) {
  const [selected, setSelected] = useState(''), [open, setOpen] = useState(false);
  const row = data.padron.find(item => item.asistencia_id === selected && item.version > 0);
  return <section aria-label="Corrección de asistencia" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h2 className="text-lg font-semibold">Estudiantes</h2>
    <SupervisionStudentSearch rows={data.padron} selectedId={selected} disabled={busy} onSelect={setSelected} onUpdate={() => setOpen(true)} />
    {open && row && <SupervisionCorrectionDialog data={data} row={row} busy={busy} onCancel={() => setOpen(false)}
      onSave={async (state) => { await onSave(row.asistencia_id, state); setOpen(false); }} />}
  </section>;
}
