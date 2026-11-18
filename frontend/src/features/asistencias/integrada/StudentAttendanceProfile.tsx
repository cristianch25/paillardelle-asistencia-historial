import { useEffect, useState } from 'react';
import axios from 'axios';
import type { AttendanceDetail } from '../asistencias.types';
import type { StudentSearchRow } from '../gestion/studentSearch.types';
import { canUpdateSearchRow, getSearchCorrectionDetail } from '../gestion/studentSearch.api';
import { formatCivilDate } from '../../../shared/dates/civilDate';
import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import { apiErrorMessage } from '../../../shared/api/apiError';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import Button from '../../../shared/components/Button';
import AdminAttendanceEditor from './AdminAttendanceEditor';
import { useNavigationProtection } from '../../../shared/navigation/NavigationProtectionContext';
import StudentProfileButton from '../../estudiantes/perfil/StudentProfileButton';

export default function StudentAttendanceProfile({ row, onBack, onReload }: {
  row: StudentSearchRow; onBack: () => void; onReload: () => void;
}) {
  const [data, setData] = useState<AttendanceDetail | null>(null), [error, setError] = useState('');
  const { request } = useNavigationProtection();
  const existing = canUpdateSearchRow(row);
  useEffect(() => {
    if (!existing) return;
    let current = true;
    void Promise.resolve().then(() => current ? getSearchCorrectionDetail(row) : null).then(detail => {
      if (current && detail) setData(detail);
    }).catch((failure: unknown) => {
      if (current && !axios.isCancel(failure)) setError(axios.isAxiosError(failure) ? apiErrorMessage(failure)
        : 'Los datos cambiaron. Actualiza los resultados antes de continuar.');
    });
    return () => { current = false; };
  }, [row, existing]);
  if (error) return <><ErrorState message={error} /><Button variant="secondary" onClick={onReload}>Actualizar resultados</Button></>;
  if (existing && !data) return <LoadingState message="Consultando asistencia del estudiante…" />;
  return <section aria-label="Perfil del estudiante" className="space-y-4">
    <Button variant="secondary" onClick={() => void request(onBack)}>Volver a resultados</Button>
    <div className="space-y-2 break-words rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-xl font-bold">{[row.estudiante.apellido_paterno, row.estudiante.apellido_materno, row.estudiante.nombres].filter(Boolean).join(' ')}</h2>
      <p className="text-sm">Código: {row.estudiante.codigo_estudiante || 'No disponible'}</p>
      <StudentProfileButton studentId={row.estudiante.id} yearId={row.anio_escolar.id} month={row.fecha.slice(0, 7)} />
      <p className="text-sm">{row.anio_escolar.anio} · {educationLevelLabels[row.seccion.nivel]} · {formatSectionName(row.seccion)}</p>
      <h3 className="font-semibold">Asistencia del {formatCivilDate(row.fecha)}</h3>
      <p className="text-sm text-slate-600">Se muestra la fecha consultada. El historial individual completo todavía no está disponible.</p>
    </div>
    {data ? <AdminAttendanceEditor initial={data} entryId={row.asistencia_id!} revalidate={async () => onReload()} />
      : <p className="text-sm text-slate-600">No hay una asistencia existente para esta fecha. No se ha creado ningún registro.</p>}
  </section>;
}
