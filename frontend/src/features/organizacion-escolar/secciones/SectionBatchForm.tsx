import { useId, useState } from 'react';
import Button from '../../../shared/components/Button';
import type { EducationLevel, SectionBatchInput } from './secciones.types';
import { educationLevelLabels } from './sectionPresentation';

type Props = { yearId: string; yearLabel: number; levels: EducationLevel[]; busy: boolean;
  onSave: (input: SectionBatchInput) => Promise<void>; onCancel: () => void };
const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const control = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2';

export default function SectionBatchForm({ yearId, yearLabel, levels, busy, onSave, onCancel }: Props) {
  const id = useId(), [level, setLevel] = useState(levels[0]);
  const [grade, setGrade] = useState(levels[0] === 'INICIAL' ? 4 : 1);
  const [from, setFrom] = useState('A'), [to, setTo] = useState('A');
  if (!level || !levels.includes(level)) return null;
  const grades = level === 'INICIAL' ? [4, 5] : Array.from({ length: level === 'PRIMARIA' ? 6 : 5 }, (_, i) => i + 1);
  const valid = letters.includes(from) && letters.includes(to) && to >= from && grades.includes(grade);
  const preview = valid ? letters.slice(letters.indexOf(from), letters.indexOf(to) + 1) : [];
  return <form aria-label="Crear varias secciones" className="space-y-4 rounded-xl border border-slate-300 bg-white p-5"
    onSubmit={event => { event.preventDefault(); if (!busy && valid) void onSave({ anio_escolar_id: yearId,
      nivel: level, grado: grade, letra_desde: from, letra_hasta: to }); }}>
    <h2 className="text-xl font-bold">Crear varias secciones</h2>
    <p className="text-sm text-slate-600">Año escolar: {yearLabel}. Revisa el rango antes de guardar. Si alguna sección ya existe, no se creará ninguna del lote.</p>
    <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label htmlFor={`${id}-level`} className="text-sm font-semibold">Nivel
        <select id={`${id}-level`} className={control} value={level} onChange={event => {
          const next = event.target.value as EducationLevel; setLevel(next); setGrade(next === 'INICIAL' ? 4 : 1);
        }}>{levels.map(value => <option key={value} value={value}>{educationLevelLabels[value]}</option>)}</select>
      </label>
      <label htmlFor={`${id}-grade`} className="text-sm font-semibold">Grado
        <select id={`${id}-grade`} className={control} value={grade} onChange={event => setGrade(Number(event.target.value))}>
          {grades.map(value => <option key={value} value={value}>{value}{level === 'INICIAL' ? ' años' : ''}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-from`} className="text-sm font-semibold">Letra inicial
        <select id={`${id}-from`} className={control} value={from} onChange={event => setFrom(event.target.value)}>
          {letters.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-to`} className="text-sm font-semibold">Letra final
        <select id={`${id}-to`} className={control} value={to} onChange={event => setTo(event.target.value)}>
          {letters.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
    </fieldset>
    {!valid ? <p role="alert" className="text-sm text-red-700">La letra final no puede ser anterior a la inicial.</p>
      : <section aria-label="Vista previa de secciones" className="space-y-2">
        <h3 className="font-semibold">Vista previa ({preview.length})</h3>
        <ul className="flex flex-wrap gap-2">{preview.map(letter => <li key={letter} className="rounded-lg bg-slate-100 px-3 py-2">{grade} {letter}</li>)}</ul>
      </section>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !valid}>{busy ? 'Guardando…' : 'Guardar secciones'}</Button>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
