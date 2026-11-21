import { useId, useState } from 'react';
import Button from '../../../shared/components/Button';
import { useUnsavedChanges } from '../../../shared/navigation/useUnsavedChanges';
import type { SchoolYearInput } from './aniosEscolares.types';

export default function SchoolYearForm({ disabled, busy, onSave, onCancel }: {
  disabled: boolean; busy: boolean; onSave: (input: SchoolYearInput) => void; onCancel: () => void;
}) {
  const id = useId(), [year, setYear] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState('');
  useUnsavedChanges('new-school-year', Boolean(year || start || end), busy);
  const field = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
  return <form aria-label="Crear año escolar" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
    onSubmit={event => { event.preventDefault(); if (!disabled) onSave({ anio: Number(year), fecha_inicio: start, fecha_fin: end }); }}>
    <h2 className="text-xl font-bold">Crear año escolar</h2>
    <p className="text-sm text-slate-600">Indica la fecha de inicio y de finalización del año escolar.</p>
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-3">
      <label htmlFor={`${id}-year`} className="text-sm font-semibold">Año escolar<input id={`${id}-year`} name="anio" type="number" min="2000" max="2200" step="1" required
        className={field} value={year} onChange={event => setYear(event.target.value)} /></label>
      <label htmlFor={`${id}-start`} className="text-sm font-semibold">Fecha de inicio<input id={`${id}-start`} name="fecha_inicio" type="date" min="1000-01-01" max={end || '9999-12-31'} required
        className={field} value={start} onChange={event => setStart(event.target.value)} /></label>
      <label htmlFor={`${id}-end`} className="text-sm font-semibold">Fecha de finalización<input id={`${id}-end`} name="fecha_fin" type="date" min={start || '1000-01-01'} max="9999-12-31" required
        className={field} value={end} onChange={event => setEnd(event.target.value)} /></label>
    </fieldset>
    <p className="text-sm text-slate-600">El nuevo año quedará preparado para su apertura.</p>
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={disabled}>{busy ? 'Guardando…' : 'Crear año'}</Button>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
