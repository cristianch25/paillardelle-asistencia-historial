import type { SupervisionDetail } from '../supervision/supervisionDetail.api';
import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import { formatCivilDate } from '../../../shared/dates/civilDate';
import AdminAttendanceEditor from './AdminAttendanceEditor';

export default function AdminSectionDetail({ detail, retry }: { detail: SupervisionDetail; retry: () => void }) {
  return <div className="space-y-4">
    <section aria-label="Sección consultada" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-xl font-semibold">{educationLevelLabels[detail.section.nivel]} · {formatSectionName(detail.section)}</h2>
      <p className="text-sm">{formatCivilDate(detail.attendance.sesion.fecha)} · {detail.attendance.sesion.estado === 'CERRADA' ? 'Asistencia cerrada' : 'Asistencia abierta'}</p>
    </section>
    <AdminAttendanceEditor initial={detail.attendance} revalidate={async () => retry()} />
  </div>;
}
