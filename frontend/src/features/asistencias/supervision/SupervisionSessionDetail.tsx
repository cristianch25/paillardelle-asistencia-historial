import { useAuth } from '../../auth/AuthContext';
import { educationLevelLabels, formatSectionName } from '../../organizacion-escolar/secciones/sectionPresentation';
import { formatCivilDate } from '../../../shared/dates/civilDate';
import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import type { SupervisionDetail } from './supervisionDetail.api';
import SupervisionSummary from './SupervisionSummary';
import SupervisionStudents from './SupervisionStudents';
import SupervisionCorrectionAction from './SupervisionCorrectionAction';
import { useSupervisionCorrection } from './useSupervisionCorrection';
import { supervisionLevels } from './supervisionAccess';

export default function SupervisionSessionDetail({ detail, retry, editable = true }: { detail: SupervisionDetail; retry: () => void; editable?: boolean }) {
  const { session } = useAuth();
  const correction = useSupervisionCorrection(detail.attendance);
  const { data, phase, busy } = correction;
  const canCorrect = editable && session && supervisionLevels(session.user).includes(detail.section.nivel);
  return <>
    {correction.error && <ErrorState message={correction.error} />}
    {correction.message && <p role="status" className="rounded-lg bg-sky-soft p-3 text-sm">{correction.message}</p>}
    {phase === 'denied' ? <Button variant="secondary" onClick={retry}>Reintentar detalle</Button>
      : phase === 'review' || phase === 'refreshing' ? <>
        {busy && <LoadingState message="Consultando estado actual…" />}
        <Button variant="secondary" disabled={busy} onClick={() => void correction.refresh()}>Consultar estado actual</Button>
      </> : <>
        <section aria-label="Sesión consultada" className="min-w-0 space-y-4 break-words rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-institutional-950">{educationLevelLabels[detail.section.nivel]} · {formatSectionName(detail.section)}</h2>
          <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-600">
            <p>Fecha: {formatCivilDate(data.sesion.fecha)}</p>
            <p className="font-semibold">{data.sesion.estado === 'ABIERTA' ? 'Sesión abierta' : 'Sesión cerrada'}</p>
          </div>
          {!editable && <SupervisionSummary resumen={data.resumen} />}
          <Button variant="secondary" disabled={busy} onClick={retry}>Actualizar detalle</Button>
        </section>
        {canCorrect && <SupervisionCorrectionAction data={data} busy={busy} onSave={async (...args) => { await correction.save(...args); }} />}
        {!editable && <SupervisionStudents padron={data.padron} />}
      </>}
  </>;
}
