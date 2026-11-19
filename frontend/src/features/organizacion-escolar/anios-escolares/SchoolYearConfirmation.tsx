import { useEffect, useRef } from 'react';
import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import type { SchoolYear } from './aniosEscolares.types';
import { useUnsavedChanges } from '../../../shared/navigation/useUnsavedChanges';

export default function SchoolYearConfirmation({ year, action, busy, uncertain, error, onConfirm, onCancel, onRefresh }: {
  year: SchoolYear; action: 'abrir' | 'cerrar'; busy: boolean; uncertain: boolean; error: string;
  onConfirm: () => void; onCancel: () => void; onRefresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), close = action === 'cerrar';
  useUnsavedChanges(`school-year:${year.id}`, uncertain, busy);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} aria-labelledby="year-confirmation-title" onCancel={event => { event.preventDefault(); if (!busy && !uncertain) onCancel(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
    <h2 id="year-confirmation-title" className="text-xl font-bold">{close ? 'Cerrar' : 'Abrir'} año escolar {year.anio}</h2>
    <p>{close ? 'El cierre se aplica a los tres niveles. Impide registrar y corregir asistencias y modificar el calendario. Los datos históricos se conservan y pueden consultarse según los permisos de cada usuario. No hay reapertura disponible en esta etapa.'
      : 'El año quedará ABIERTO para trabajar con sus secciones y calendario. Las matrículas y asignaciones de años anteriores no se trasladan automáticamente.'}</p>
    {close && <p className="text-sm text-slate-600">No es necesario completar asistencias pendientes ni cerrar las sesiones diarias.</p>}
    {error && <ErrorState message={error} />}
    <div className="flex flex-wrap gap-3">{uncertain ? <Button onClick={onRefresh}>Consultar años</Button> : <>
      <Button disabled={busy} onClick={onConfirm}>{busy ? 'Guardando…' : close ? 'Confirmar cierre' : 'Confirmar apertura'}</Button>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button></>}</div>
  </dialog>;
}
