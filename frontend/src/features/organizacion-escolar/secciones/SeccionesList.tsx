import Button from '../../../shared/components/Button';
import type { Section } from './secciones.types';
import { educationLevelLabels, formatSectionName } from './sectionPresentation';
import type { SchoolYear } from '../anios-escolares/aniosEscolares.types';

type Props = { sections: Section[]; years?: SchoolYear[]; selectedId?: string; checking: boolean; onSelect: (section: Section) => void };
export default function SeccionesList({ sections, years, selectedId, checking, onSelect }: Props) {
  return (
    <ul aria-label="Secciones disponibles" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {sections.map(section => {
        const year = years?.find(item => item.id === section.anio_escolar_id);
        return (
        <li key={section.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-institutional-800">{educationLevelLabels[section.nivel]}</p>
          <h2 className="mt-2 break-words text-xl font-bold">{formatSectionName(section)}</h2>
          <dl className="mt-4 space-y-2 text-sm text-slate-600">
            {year && <div><dt className="inline font-medium">Año escolar: </dt><dd className="inline">{year.anio} · {year.estado}</dd></div>}
            {section.turno && <div><dt className="inline font-medium">Turno: </dt><dd className="inline break-words">{section.turno}</dd></div>}
            <div><dt className="inline font-medium">Estado: </dt><dd className="inline">{section.activo ? 'Activa' : 'Inactiva'}</dd></div>
          </dl>
          <Button className="mt-5 w-full" variant={section.id === selectedId ? 'secondary' : 'primary'}
            disabled={checking || (years !== undefined && !year)} aria-pressed={section.id === selectedId}
            aria-label={`Seleccionar ${formatSectionName(section)} — ${educationLevelLabels[section.nivel]}`} onClick={() => onSelect(section)}>
            {section.id === selectedId ? 'Seleccionada' : 'Seleccionar'}
          </Button>
          {years !== undefined && !year && !checking && <p className="mt-2 text-sm text-slate-600">No se puede seleccionar sin los datos del año escolar.</p>}
        </li>
      ); })}
    </ul>
  );
}
