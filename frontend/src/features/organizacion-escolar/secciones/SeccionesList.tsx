import Button from '../../../shared/components/Button';
import type { Section } from './secciones.types';
import { educationLevelLabels, formatSectionName } from './sectionPresentation';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';
import type { ReactNode } from 'react';

type Props = { sections: Section[]; years?: SchoolYear[]; selectedId?: string; checking: boolean;
  formatName?: typeof formatSectionName; attendanceLabel?: string; showAttendance?: boolean; showStudents?: boolean; compact?: boolean; renderSummary?: (section: Section) => ReactNode;
  renderActions?: (section: Section) => ReactNode } & (
  { onSelect: (section: Section) => void; onOpen?: never }
  | { onSelect?: never; onOpen: (section: Section, destination: 'asistencia' | 'estudiantes') => void }
);
export default function SeccionesList({ sections, years, selectedId, checking, onSelect, onOpen, formatName = formatSectionName, attendanceLabel = 'Asistencia diaria', showAttendance = true, showStudents = true, compact = false, renderSummary, renderActions }: Props) {
  return (
    <ul aria-label="Secciones disponibles" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {sections.map(section => {
        const year = years?.find(item => item.id === section.anio_escolar_id);
        return (
        <li key={section.id} className="min-w-0 rounded-lg border border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-institutional-800">{educationLevelLabels[section.nivel]}</p>
          <h2 className="mt-2 break-words text-xl font-bold">{formatName(section)}</h2>
          {!compact && <dl className="mt-4 space-y-2 text-sm text-slate-600">
            {section.turno && <div><dt className="inline font-medium">Turno: </dt><dd className="inline break-words">{section.turno}</dd></div>}
            <div><dt className="sr-only">Estado</dt><dd className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${section.activo
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
              {section.activo ? 'Activa' : 'Inactiva'}</dd></div>
          </dl>}
          {renderSummary?.(section)}
          {onOpen ? <div className="mt-4 flex flex-col gap-2">
            {showAttendance && <Button disabled={checking || !year} aria-label={`${attendanceLabel} de ${formatName(section)} — ${educationLevelLabels[section.nivel]}`}
              onClick={() => onOpen(section, 'asistencia')}>{attendanceLabel}</Button>}
            {showStudents && <Button variant={showAttendance ? 'secondary' : 'primary'} disabled={checking || !year} aria-label={`Ver estudiantes de ${formatName(section)} — ${educationLevelLabels[section.nivel]}`}
              onClick={() => onOpen(section, 'estudiantes')}>Ver estudiantes</Button>}
          </div> : <Button className="mt-5 w-full" variant={section.id === selectedId ? 'secondary' : 'primary'}
            disabled={checking || (years !== undefined && !year)} aria-pressed={section.id === selectedId}
            aria-label={`Seleccionar ${formatName(section)} — ${educationLevelLabels[section.nivel]}`} onClick={() => onSelect(section)}>
            {section.id === selectedId ? 'Seleccionada' : 'Seleccionar'}
          </Button>}
          {renderActions?.(section)}
          {years !== undefined && !year && !checking && <p className="mt-2 text-sm text-slate-600">No se puede seleccionar sin los datos del año escolar.</p>}
        </li>
      ); })}
    </ul>
  );
}
