import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/Button';
import { formatCivilDate, peruToday, validCivilDate } from '../../shared/dates/civilDate';
import { apiErrorMessage, errorEscritura } from '../../shared/api/apiError';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { changeStudentSection } from './matriculas.api';
import { getSections } from '../organizacion-escolar/secciones/secciones.api';
import { formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import type { Section } from '../organizacion-escolar/secciones/secciones.types';
import type { PadronEntry } from '../organizacion-escolar/secciones/padron.types';

const shiftDay = (dateStr: string, delta: number) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

export default function SectionChangeDialog({
  entry,
  currentSection,
  onClose,
  onSuccess,
  onCheckState,
}: {
  entry: PadronEntry;
  currentSection: Pick<Section, 'id' | 'anio_escolar_id' | 'nivel' | 'grado' | 'letra'>;
  onClose: () => void;
  onSuccess: () => void;
  onCheckState?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false);
  const today = peruToday(), minDate = shiftDay(entry.fecha_inicio, 1);
  const [fechaEfectiva, setFechaEfectiva] = useState(today >= minDate ? today : minDate);
  const [destSections, setDestSections] = useState<Section[]>([]);
  const [selectedDestId, setSelectedDestId] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);

  useUnsavedChanges(`section-change:${entry.id}`, true, busy);

  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);

  useEffect(() => {
    let active = true;
    void getSections({ anio_escolar_id: currentSection.anio_escolar_id, nivel: currentSection.nivel,
      grado: String(currentSection.grado), activo: 'true', page: 1, limit: 100 })
      .then(res => {
        if (!active) return;
        const options = res.secciones.filter(s => s.id !== currentSection.id);
        setDestSections(options);
        if (options[0]) setSelectedDestId(options[0].id);
        setLoading(false);
      }).catch(err => { if (active) { setError(apiErrorMessage(err)); setLoading(false); } });
    return () => { active = false; };
  }, [currentSection]);

  const studentName = [entry.estudiante.apellido_paterno, entry.estudiante.apellido_materno, entry.estudiante.nombres].filter(Boolean).join(' ');
  const selectedDest = destSections.find(s => s.id === selectedDestId);
  const valid = validCivilDate(fechaEfectiva) && fechaEfectiva >= minDate && fechaEfectiva <= today && Boolean(selectedDestId);

  async function submit() {
    if (busy || running.current || uncertain || !valid || !selectedDestId) return;
    running.current = true; setBusy(true); setError('');
    try {
      await changeStudentSection(entry.id, selectedDestId, fechaEfectiva);
      onSuccess(); onClose();
    } catch (err: unknown) {
      const fallo = errorEscritura(err);
      setError(fallo.mensaje); setUncertain(fallo.incierto);
    } finally { setBusy(false); running.current = false; }
  }

  return (
    <dialog ref={dialog} aria-labelledby="section-change-title"
      onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
      <h2 id="section-change-title" className="text-xl font-bold">Cambiar sección de estudiante</h2>
      <p className="break-words font-medium">{studentName}</p>
      <p className="text-sm text-slate-600">Sección actual: <strong>{formatSectionName(currentSection)}</strong></p>

      {loading ? <p className="text-sm text-slate-500">Cargando secciones disponibles…</p>
        : destSections.length === 0 ? (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
              {error || 'No hay otras secciones activas en este grado para realizar el cambio.'}
            </p>
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
            <label className="block text-sm font-semibold">
              Sección destino
              <select required disabled={busy || uncertain} value={selectedDestId}
                onChange={e => { setSelectedDestId(e.target.value); setError(''); }}
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 bg-white">
                {destSections.map(s => <option key={s.id} value={s.id}>{formatSectionName(s)} {s.turno ? `(${s.turno})` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Primer día en la nueva sección (fecha efectiva)
              <input type="date" required min={minDate} max={today} value={fechaEfectiva} disabled={busy || uncertain}
                onChange={e => { setFechaEfectiva(e.target.value); setError(''); }}
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2" />
            </label>
            {valid && selectedDest && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
                <p>El estudiante pertenecerá a <strong>{formatSectionName(currentSection)}</strong> hasta el <strong>{formatCivilDate(shiftDay(fechaEfectiva, -1))}</strong>.</p>
                <p>Desde el <strong>{formatCivilDate(fechaEfectiva)}</strong> figurará en <strong>{formatSectionName(selectedDest)}</strong>.</p>
                <p className="text-xs text-slate-500">Sus asistencias anteriores se mantendrán intactas en su sección original.</p>
              </div>
            )}
            {error && <p role="alert" className="text-sm font-medium text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-200">{error}</p>}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={busy || uncertain || !valid}>{busy ? 'Cambiando…' : 'Confirmar cambio'}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => { if (uncertain) onCheckState?.(); onClose(); }}>
                {uncertain ? 'Comprobar estado' : 'Cancelar'}</Button>
            </div>
          </form>
        )}
    </dialog>
  );
}
