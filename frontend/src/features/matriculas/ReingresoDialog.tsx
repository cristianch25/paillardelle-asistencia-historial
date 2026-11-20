import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/Button';
import { formatCivilDate, peruToday, validCivilDate } from '../../shared/dates/civilDate';
import { apiErrorMessage, errorEscritura } from '../../shared/api/apiError';
import { useUnsavedChanges } from '../../shared/navigation/useUnsavedChanges';
import { reingresoStudent } from './matriculas.api';
import { getSections } from '../organizacion-escolar/secciones/secciones.api';
import { formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import type { EducationLevel, Section } from '../organizacion-escolar/secciones/secciones.types';

const shiftDay = (dateStr: string, delta: number) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

export default function ReingresoDialog({
  studentName,
  matriculaId,
  anioEscolarId,
  nivel,
  grado,
  fechaRetiro,
  onClose,
  onSuccess,
  onCheckState,
}: {
  studentName: string;
  matriculaId: string;
  anioEscolarId: string;
  nivel: EducationLevel;
  grado: number;
  fechaRetiro: string;
  onClose: () => void;
  onSuccess: () => void;
  onCheckState?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false);
  const today = peruToday(), minDate = shiftDay(fechaRetiro, 1);
  const [fechaReingreso, setFechaReingreso] = useState(today >= minDate ? today : minDate);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);

  useUnsavedChanges(`reingreso:${matriculaId}`, true, busy);

  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);

  useEffect(() => {
    let active = true;
    void getSections({ anio_escolar_id: anioEscolarId, nivel, grado: String(grado), activo: 'true', page: 1, limit: 100 })
      .then(res => {
        if (!active) return;
        setSections(res.secciones);
        if (res.secciones[0]) setSelectedSectionId(res.secciones[0].id);
        setLoading(false);
      }).catch(err => { if (active) { setError(apiErrorMessage(err)); setLoading(false); } });
    return () => { active = false; };
  }, [anioEscolarId, nivel, grado]);

  const selectedSection = sections.find(s => s.id === selectedSectionId);
  const valid = validCivilDate(fechaReingreso) && fechaReingreso >= minDate && fechaReingreso <= today && Boolean(selectedSectionId);
  const lastRetiredDay = valid ? shiftDay(fechaReingreso, -1) : '';

  async function submit() {
    if (busy || running.current || uncertain || !valid || !selectedSectionId) return;
    running.current = true; setBusy(true); setError('');
    try {
      await reingresoStudent(matriculaId, selectedSectionId, fechaReingreso);
      onSuccess(); onClose();
    } catch (err: unknown) {
      const fallo = errorEscritura(err);
      setError(fallo.mensaje); setUncertain(fallo.incierto);
    } finally { setBusy(false); running.current = false; }
  }

  return (
    <dialog ref={dialog} aria-labelledby="reingreso-dialog-title"
      onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
      <h2 id="reingreso-dialog-title" className="text-xl font-bold">Reingresar estudiante</h2>
      <p className="break-words font-medium">{studentName}</p>
      <p className="text-sm text-slate-600">Fecha de retiro anterior: <strong>{formatCivilDate(fechaRetiro)}</strong></p>

      {loading ? <p className="text-sm text-slate-500">Cargando secciones disponibles…</p>
        : sections.length === 0 ? (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
              {error || 'No hay secciones activas en este grado para realizar el reingreso.'}
            </p>
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
            <label className="block text-sm font-semibold">
              Sección de destino
              <select required disabled={busy || uncertain} value={selectedSectionId}
                onChange={e => { setSelectedSectionId(e.target.value); setError(''); }}
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2 bg-white">
                {sections.map(s => <option key={s.id} value={s.id}>{formatSectionName(s)} {s.turno ? `(${s.turno})` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Fecha de reingreso (primer día en la sección)
              <input type="date" required min={minDate} max={today} value={fechaReingreso} disabled={busy || uncertain}
                onChange={e => { setFechaReingreso(e.target.value); setError(''); }}
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 p-2" />
            </label>
            {valid && selectedSection && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
                <p>El estudiante reingresará a <strong>{formatSectionName(selectedSection)}</strong> desde el <strong>{formatCivilDate(fechaReingreso)}</strong>.</p>
                {minDate <= lastRetiredDay && (
                  <p>Durante el período del <strong>{formatCivilDate(minDate)}</strong> al <strong>{formatCivilDate(lastRetiredDay)}</strong> no figurará en padrones ni asistencias.</p>
                )}
                <p className="text-xs text-slate-500">Sus asistencias y vínculos anteriores se conservarán intactos en su historial.</p>
              </div>
            )}
            {error && <p role="alert" className="text-sm font-medium text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-200">{error}</p>}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={busy || uncertain || !valid}>{busy ? 'Reingresando…' : 'Confirmar reingreso'}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => { if (uncertain) onCheckState?.(); onClose(); }}>
                {uncertain ? 'Comprobar estado' : 'Cancelar'}</Button>
            </div>
          </form>
        )}
    </dialog>
  );
}
