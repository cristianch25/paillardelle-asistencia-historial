import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import Button from '../../shared/components/Button';
import EmptyState from '../../shared/components/EmptyState';
import ErrorState from '../../shared/components/ErrorState';
import FormField from '../../shared/components/FormField';
import LoadingState from '../../shared/components/LoadingState';
import { peruToday, validCivilDate } from '../../shared/dates/civilDate';
import { useSectionSelection } from '../organizacion-escolar/secciones/SeccionSelectionContext';
import { educationLevelLabels, formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import { useAsistenciaSession } from './useAsistenciaSession';
import AttendanceCalendarInfo from './AttendanceCalendarInfo';
import AsistenciaSessionView from './AsistenciaSessionView';
import { useAttendanceDraft } from './useAttendanceDraft';
import AttendanceSaveBar from './AttendanceSaveBar';
import AttendanceReview from './AttendanceReview';
import AttendanceCloseAction from './AttendanceCloseAction';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';

export default function AsistenciaDiariaPage() {
  const { session } = useAuth();
  const { selected, checking, unverified, error, revalidate } = useSectionSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const { request } = useNavigationProtection();
  const [fecha, setFecha] = useState(() => {
    const candidate: unknown = location.state?.fecha;
    return typeof candidate === 'string' && validCivilDate(candidate) ? candidate : peruToday();
  });
  const selection = session && !checking && !error ? selected : null;
  const paused = checking || Boolean(unverified);
  const attendance = useAsistenciaSession(session?.user.id ?? null, selection, fecha, paused);
  const draft = useAttendanceDraft(session?.user.id ?? null, attendance.data, paused, revalidate);
  const valid = validCivilDate(fecha);
  const backLabel = session?.user.rol === 'REGISTRADOR' ? 'mis secciones' : 'secciones';
  return (
    <div className="space-y-4">
      <Button variant="secondary" disabled={draft.busy} onClick={() => void navigate(`/secciones${location.search}`)}>
        <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />Volver a {backLabel}
      </Button>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Asistencia diaria</h1>
      {checking ? <LoadingState message="Comprobando la sección…" /> : error ? (
        <div className="space-y-3"><ErrorState message={error} />
          <Button variant="secondary" onClick={() => void revalidate()}>Volver a comprobar selección</Button></div>
      ) : !selection ? <EmptyState message="Selecciona una sección para consultar su asistencia diaria." /> : (
        <>
          <section aria-label="Detalle de sección" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="break-words text-lg font-semibold">{formatSectionName(selection.section)} — {educationLevelLabels[selection.section.nivel]}</h2>
            {session?.user.rol === 'REGISTRADOR' ? <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">Detalles</summary>
              <p>Año escolar {selection.year.anio}{selection.section.turno && ` · Turno: ${selection.section.turno}`}</p>
            </details> : <>
              <p className="text-sm text-slate-600">Año escolar {selection.year.anio}</p>
              {selection.section.turno && <p className="break-words text-sm text-slate-600">Turno: {selection.section.turno}</p>}
            </>}
          </section>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs sm:w-60"><FormField label="Fecha de asistencia" type="date" value={fecha} disabled={draft.busy}
              onChange={event => { const next = event.target.value; void request(() => setFecha(next)); }} error={valid ? undefined : 'Selecciona una fecha completa y válida.'} /></div>
            {!draft.base && <Button disabled={!valid || attendance.pending || draft.busy} onClick={() => void request(attendance.open)} aria-describedby="opening-hint">
              {attendance.pending ? 'Abriendo asistencia…' : 'Abrir asistencia'}
            </Button>}
          </div>
          {!draft.base && <p id="opening-hint" className="text-xs text-slate-600">Abre o inicia la asistencia de esta fecha.</p>}
          {valid && <AttendanceCalendarInfo selection={selection} fecha={fecha} />}
          {attendance.pending && <LoadingState message="Abriendo o recuperando la sesión de asistencia…" />}
          {attendance.error && <ErrorState message={attendance.error} />}
          {draft.phase === 'denied' && <ErrorState message={draft.message} />}
          {draft.base && <>
            <AttendanceReview data={draft.base} changes={draft.changes} conflicts={draft.conflicts}
              onResolve={draft.resolve} disabled={draft.busy} />
            <AsistenciaSessionView data={draft.base} changes={draft.changes} created={attendance.data?.creada} editable={draft.editable} disabled={draft.disabled} updated={draft.updated}
              onSelect={draft.select} onMarkPending={draft.markAllPending} />
          </>}
        </>
      )}
      <AttendanceCloseAction key={draft.key} available={Boolean(selection && draft.base?.sesion.estado === 'ABIERTA')}
        pending={draft.base?.resumen.pendientes ?? 0} dirty={draft.count} disabled={paused || draft.phase !== 'idle'} onClose={draft.close} />
      {selection && draft.base && <AttendanceSaveBar count={draft.count} phase={draft.phase} message={draft.message}
        success={draft.success} conflicts={draft.conflicts.length} closed={draft.base.sesion.estado === 'CERRADA'}
        disabled={draft.disabled} onSave={() => void draft.save()} onRefresh={() => void draft.refresh()} />}
    </div>
  );
}
