import { educationLevelLabels, formatAdministrativeSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import { correctionLabel } from '../supervision/supervisionCorrection';
import { searchRowKey, type StudentSearchRow } from './studentSearch.types';
import { canUpdateSearchRow } from './studentSearch.api';

function searchAttendanceLabel(row: StudentSearchRow) {
  return row.situacion === 'SIN_SESION' ? 'Sin sesión' : row.situacion === 'SIN_ASISTENCIA' ? 'Sin asistencia'
    : row.estado === 'PENDIENTE' ? 'Pendiente' : correctionLabel(row.estado!);
}
export default function StudentSearchResults({ rows, selectedKey, onSelect }: {
  rows: StudentSearchRow[]; selectedKey: string; onSelect: (key: string) => void;
}) {
  return <ul aria-label="Resultados de búsqueda de estudiantes" className="max-h-[32rem] overflow-y-auto rounded-xl border border-slate-200 bg-white">
    {rows.map(row => <li key={searchRowKey(row)} className="border-b border-slate-100 last:border-0">
      <button type="button" aria-pressed={selectedKey === searchRowKey(row)} onClick={() => onSelect(searchRowKey(row))}
        className={`block min-h-11 w-full space-y-2 break-words p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-institutional-700 ${selectedKey === searchRowKey(row) ? 'bg-sky-soft ring-1 ring-inset ring-institutional-700' : 'hover:bg-slate-50'}`}>
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 font-medium">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}</span>
          <span className="shrink-0 text-right text-sm font-semibold">{searchAttendanceLabel(row)}</span>
        </span>
        <span className="block text-sm text-slate-600">Código: {row.estudiante.codigo_estudiante || 'No disponible'}</span>
        <span className="block text-sm text-slate-600">{educationLevelLabels[row.seccion.nivel]} · {formatAdministrativeSectionName(row.seccion)} · {row.anio_escolar.anio}</span>
        {!canUpdateSearchRow(row) && <span className="block text-sm text-slate-600">No hay una asistencia existente para actualizar.</span>}
      </button>
    </li>)}
  </ul>;
}
