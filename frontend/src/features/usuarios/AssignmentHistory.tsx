import { useState } from 'react';
import Button from '../../shared/components/Button';
import { formatCivilDate, peruToday } from '../../shared/dates/civilDate';
import { educationLevelLabels, formatAdministrativeSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import type { SectionAssignment } from '../organizacion-escolar/secciones/sectionStaff.api';
import type { AssignmentCatalog } from './usuarios.types';
import AssignmentEndDialog from './AssignmentEndDialog';

export default function AssignmentHistory({ assignments, catalog, busy, showUser = false, onFinalize }: {
  assignments: SectionAssignment[]; catalog: Pick<AssignmentCatalog, 'sections' | 'years'>; busy: boolean; showUser?: boolean;
  onFinalize: (row: SectionAssignment, date: string) => Promise<boolean>;
}) {
  const [ending, setEnding] = useState<SectionAssignment | null>(null);
  function label(row: SectionAssignment) {
    const section = catalog.sections.find(item => item.id === row.seccion_id);
    const year = catalog.years.find(item => item.id === section?.anio_escolar_id);
    return section ? `${educationLevelLabels[section.nivel]} · ${formatAdministrativeSectionName(section)} · ${year?.anio ?? 'Año no disponible'}` : 'Sección no disponible';
  }
  return <section aria-label="Asignaciones registradas" className="space-y-3">
    <h2 className="text-lg font-semibold">Asignaciones registradas</h2>
    {!assignments.length ? <p className="text-sm text-slate-600">Sin asignaciones registradas.</p> : <ul className="space-y-3">{assignments.map(row =>
      <li key={row.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        {showUser && <p className="font-semibold">{row.usuario?.nombres} {row.usuario?.apellidos}</p>}
        <p>{label(row)}</p><p>{formatCivilDate(row.fecha_inicio)} — {row.fecha_fin ? formatCivilDate(row.fecha_fin) : 'Sin fecha de fin'}</p>
        <p className="text-xs text-slate-600">{row.fecha_inicio > peruToday() ? 'Programada' : row.fecha_fin && row.fecha_fin < peruToday() ? 'Finalizada' : 'Vigente'}</p>
        {(row.fecha_fin === null || row.fecha_fin >= peruToday()) && <Button variant="secondary" disabled={busy} onClick={() => setEnding(row)}>Finalizar asignación</Button>}
      </li>)}</ul>}
    {ending && <AssignmentEndDialog assignment={ending} label={label(ending)} busy={busy}
      onSave={date => onFinalize(ending, date)} onClose={() => setEnding(null)} />}
  </section>;
}
