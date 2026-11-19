import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { EducationLevel } from '../secciones/secciones.types';
import { calendarError, exceptionDescription, saveCalendarException, type CalendarDay } from './calendario.api';
import { formatCivilDate } from '../../../shared/dates/civilDate';
import { useUnsavedChanges } from '../../../shared/navigation/useUnsavedChanges';
import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import { educationLevelLabels } from '../secciones/sectionPresentation';
import { mixedCalendarDay } from './calendarScopes';

export default function CalendarDayEditor({ yearId, levels, day, onClose, onSaved }: {
  yearId: string; levels: EducationLevel[]; day: CalendarDay; onClose: () => void; onSaved: (confirmed: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false);
  const [choice, setChoice] = useState(mixedCalendarDay(day) ? '' : String(day.es_lectivo)), [description, setDescription] = useState(day.descripcion ?? '');
  const lective = choice === 'true';
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const dirty = choice !== '' && lective !== day.es_lectivo || description !== (day.descripcion ?? '');
  useUnsavedChanges(`calendar:${yearId}:${levels.join(',')}:${day.fecha}`, dirty || uncertain, busy);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  async function submit() {
    if (running.current || uncertain || !choice) return;
    running.current = true; setBusy(true); setError('');
    try { await saveCalendarException(yearId, levels[0]!, day.fecha, lective, description, levels); onSaved(true); }
    catch (cause) {
      const status = axios.isAxiosError(cause) ? cause.response?.status : undefined;
      const unknown = ![400, 401, 403, 404, 409].includes(status ?? 0);
      setUncertain(unknown); setReview(false);
      setError(unknown ? 'No se pudo verificar el guardado. Consulta el calendario antes de volver a guardar.' : calendarError(cause));
    } finally { running.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="calendar-editor-title" onCancel={event => { event.preventDefault(); if (!busy && !uncertain) onClose(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/40 sm:p-7">
    <h2 id="calendar-editor-title" className="text-xl font-bold">{formatCivilDate(day.fecha)}</h2>
    <p className="mt-2 text-sm font-semibold">Aplicar a: {levels.map(level => educationLevelLabels[level]).join(', ')}</p>
    {day.por_nivel ? <ul className="mt-2 text-sm text-slate-600">{day.por_nivel.map(entry => <li key={entry.nivel}>{educationLevelLabels[entry.nivel]}: {entry.es_lectivo ? 'Lectivo' : 'No lectivo'}</li>)}</ul>
      : <p className="mt-2 text-sm text-slate-600">Estado actual: {day.es_lectivo ? 'Lectivo' : 'No lectivo'}</p>}
    {levels.length > 1 && <p className="mt-2 text-sm">Se guardarán todos juntos. Si un nivel tiene conflicto, no se cambiará ninguno.</p>}
    <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); if (!review) setReview(true); else void submit(); }}>
      <label className="block text-sm font-semibold">Tipo de día<select value={choice} disabled={busy || uncertain} required
        onChange={event => { setChoice(event.target.value); setReview(false); }} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2">
        <option value="" disabled>Elige el estado para todos los niveles</option>
        <option value="true">Día lectivo / recuperación</option><option value="false">Día no lectivo</option>
      </select></label>
      <label className="block text-sm font-semibold">Descripción (opcional)<input value={description} maxLength={150} disabled={busy || uncertain}
        placeholder="Feriado, recuperación de clases…" onChange={event => { setDescription(event.target.value); setReview(false); }}
        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 p-2" /></label>
      {!description.trim() && <p className="text-xs text-slate-600">Se guardará como «{exceptionDescription(lective, '')}».</p>}
      {review && <p role="status" className="rounded-lg bg-sky-soft p-3 text-sm">¿Confirmar {lective ? 'día lectivo / recuperación' : 'día no lectivo'} para esta fecha y nivel?</p>}
      {error && <ErrorState message={error} />}
      <div className="flex flex-wrap gap-3">{uncertain ? <Button onClick={() => onSaved(false)}>Consultar calendario</Button>
        : <><Button type="submit" disabled={busy || !choice}>{busy ? 'Guardando…' : review ? 'Confirmar y guardar' : 'Revisar cambio'}</Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button></>}
      </div>
    </form>
  </dialog>;
}
