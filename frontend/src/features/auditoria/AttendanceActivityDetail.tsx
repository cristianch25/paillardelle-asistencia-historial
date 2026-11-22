import { formatCivilDate } from '../../shared/dates/civilDate';
import { correctionLabel } from '../asistencias/attendanceDraft';
import { educationLevelLabels, formatRegistrarSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import type { AuditRecord } from './auditoria.types';

export default function AttendanceActivityDetail({ data }: { data: NonNullable<AuditRecord['asistencia']> }) {
  return <div className="space-y-1">
    <p className="font-semibold">{data.estudiante.nombre_completo}</p>
    <p>{formatRegistrarSectionName(data.seccion)} · {educationLevelLabels[data.seccion.nivel]}</p>
    <p>Asistencia del {formatCivilDate(data.fecha)}</p>
    <p className="font-medium">{correctionLabel(data.estado_anterior)} → {correctionLabel(data.estado_nuevo)}</p>
    {(data.justificada_anterior || data.motivo_justificacion_anterior) && <p>Justificación anterior: {data.motivo_justificacion_anterior || 'Justificada'}</p>}
    {(data.justificada_nueva || data.motivo_justificacion_nuevo) && <p>Justificación nueva: {data.motivo_justificacion_nuevo || 'Justificada'}</p>}
    {data.motivo && <p>Motivo de corrección: {data.motivo}</p>}
  </div>;
}
