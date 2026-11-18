import { useId, useState } from 'react';
import Button from '../../../shared/components/Button';
import FormField from '../../../shared/components/FormField';
import type { EducationLevel, Section, SectionInput } from './secciones.types';
import { educationLevelLabels } from './sectionPresentation';

type Props = { yearId: string; section?: Section; busy: boolean; levels: EducationLevel[];
  onCancel: () => void; onSave: (input: SectionInput) => Promise<void> };
export default function SectionForm({ yearId, section, busy, levels, onCancel, onSave }: Props) {
  const id = useId();
  const [level, setLevel] = useState<EducationLevel | undefined>(section?.nivel ?? levels[0]);
  const [grade, setGrade] = useState(section?.grado ?? (levels[0] === 'INICIAL' ? 4 : 1));
  const [name, setName] = useState(section?.letra ?? '');
  if (!level || !levels.includes(level)) return null;
  const grades = level === 'INICIAL' ? [4, 5] : Array.from({ length: level === 'PRIMARIA' ? 6 : 5 }, (_, i) => i + 1);
  const control = 'mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2';
  return <form aria-label={section ? 'Editar sección' : 'Crear sección'} className="space-y-4 rounded-xl border border-slate-300 bg-white p-5"
    onSubmit={event => { event.preventDefault(); if (!busy && levels.includes(level)) void onSave({ anio_escolar_id: yearId, nivel: level, grado: grade, letra: name }); }}>
    <h2 className="text-xl font-bold">{section ? 'Editar sección' : 'Crear sección'}</h2>
    <p className="text-sm text-slate-600">{section ? 'El año y el nivel se conservan. Grado y nombre solo pueden cambiar sin referencias académicas.'
      : 'Puedes crear secciones en tus niveles autorizados.'}</p>
    <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-3">
      {!section && levels.length > 1 ? <label htmlFor={`${id}-level`} className="text-sm font-semibold">Nivel
        <select id={`${id}-level`} className={control} value={level} onChange={e => {
          const next = e.target.value as EducationLevel; setLevel(next); setGrade(next === 'INICIAL' ? 4 : 1);
        }}>{levels.map(value => <option key={value} value={value}>{educationLevelLabels[value]}</option>)}</select>
      </label> : <div className="text-sm"><p className="font-semibold">Nivel</p><p className="mt-2 py-2">{educationLevelLabels[level]}</p></div>}
      <label htmlFor={`${id}-grade`} className="text-sm font-semibold">Grado
        <select id={`${id}-grade`} className={control} value={grade} onChange={e => setGrade(Number(e.target.value))}>
          {grades.map(value => <option key={value} value={value}>{value}{level === 'INICIAL' ? ' años' : ''}</option>)}
        </select>
      </label>
      <FormField label="Nombre de sección" value={name} hint="Hasta 30 caracteres: A, CREATIVOS o GENIALES."
        onChange={e => setName(e.target.value)} error={Array.from(name).length > 30 ? 'El nombre admite hasta 30 caracteres.' : undefined} />
    </fieldset>
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || Array.from(name).length > 30}>{busy ? 'Guardando…' : 'Guardar sección'}</Button>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
  </form>;
}
