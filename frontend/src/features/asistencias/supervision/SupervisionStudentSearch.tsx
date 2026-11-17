import { useId, useRef, useState } from 'react';
import type { AttendanceEntry } from '../asistencias.types';
import FormField from '../../../shared/components/FormField';
import Button from '../../../shared/components/Button';
import { correctionLabel } from './supervisionCorrection';
import { correctionStudentName, searchCorrectionStudents } from './correctionStudentSearch';

type Props = { rows: AttendanceEntry[]; selectedId: string; disabled: boolean; onSelect: (id: string) => void; onUpdate?: () => void };
export default function SupervisionStudentSearch({ rows, selectedId, disabled, onSelect, onUpdate }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const input = useRef<HTMLInputElement>(null), resultsId = useId();
  const matches = searchCorrectionStudents(rows, query).filter(row => !state || row.estado === state);
  const selected = matches.find(row => row.asistencia_id === selectedId && row.version > 0);
  return <div className="min-w-0 space-y-3">
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
    <FormField ref={input} label="Buscar estudiante" type="search" value={query} disabled={disabled}
      aria-controls={resultsId} autoComplete="off" placeholder="Nombres, apellidos o código"
      hint="Usa Tab para recorrer los resultados y Enter para seleccionar una asistencia previamente registrada."
      onChange={event => { setQuery(event.target.value); onSelect(''); }} />
    <label className="block text-sm font-semibold">Estado de asistencia
      <select value={state} disabled={disabled} onChange={event => { setState(event.target.value); onSelect(''); }}
        className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-normal focus-visible:outline-2 focus-visible:outline-institutional-700">
        <option value="">Todos</option>
        {['PRESENTE', 'TARDANZA', 'FALTA', 'PENDIENTE'].map(value => <option key={value} value={value}>{correctionLabel(value as AttendanceEntry['estado'])}</option>)}
      </select>
    </label>
    </div>
    <p role="status" className="text-sm text-slate-600">{matches.length
      ? `${matches.length} ${matches.length === 1 ? 'coincidencia' : 'coincidencias'}` : 'No se encontraron estudiantes'}</p>
    <ul id={resultsId} aria-label="Resultados de búsqueda de estudiantes"
      className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
      {matches.map(row => <li key={row.asistencia_id} className="border-b border-slate-100 last:border-0">
        <button type="button" disabled={disabled || row.version === 0} aria-pressed={row.asistencia_id === selectedId}
          onClick={() => onSelect(row.asistencia_id)}
          className={`block min-h-11 w-full space-y-1 break-words p-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed disabled:opacity-50 ${row.asistencia_id === selectedId ? 'bg-sky-soft ring-1 ring-inset ring-institutional-700' : 'hover:bg-slate-50'}`}>
          <span className="flex items-center justify-between gap-3">
          <span className="min-w-0 font-medium">{correctionStudentName(row)}</span>
          <span className="shrink-0 text-sm font-semibold">{correctionLabel(row.estado)}</span>
          </span>
          <span className="block text-sm text-slate-600">Código: {row.estudiante.codigo_estudiante || 'No disponible'}</span>
        </button>
      </li>)}
    </ul>
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button variant="secondary" disabled={disabled || !selected} onClick={() => {
        setQuery(''); setState(''); onSelect(''); input.current?.focus();
      }}>Limpiar selección</Button>
      <Button disabled={disabled || !selected} onClick={onUpdate}>Actualizar asistencia</Button>
    </div>
  </div>;
}
