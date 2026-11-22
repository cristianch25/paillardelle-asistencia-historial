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
import { educationLevelLabels, formatRegistrarSectionName, formatSectionName } from '../organizacion-escolar/secciones/sectionPresentation';
import { useAsistenciaSession } from './useAsistenciaSession';
import AttendanceCalendarInfo from './AttendanceCalendarInfo';
import AsistenciaSessionView from './AsistenciaSessionView';
import { useAttendanceDraft } from './useAttendanceDraft';
import AttendanceSaveBar from './AttendanceSaveBar';
import AttendanceReview from './AttendanceReview';
import { useNavigationProtection } from '../../shared/navigation/NavigationProtectionContext';
import { useAttendanceCalendar } from './useAttendanceCalendar';
import { draftSummary } from './attendanceDraft';
import UnsavedChangesDialog from '../../shared/navigation/UnsavedChangesDialog';

export default function AsistenciaDiariaPage() {
  const { session } = useAuth();
  const { selected, checking, unverified, error, revalidate, attendanceDate } = useSectionSelection();
  const location = useLocation();
  const navigate = useNavigate();
  const { request } = useNavigationProtection();
  const [localDate, setFecha] = useState(() => {
    const candidate: unknown = location.state?.fecha;
    return typeof candidate === 'string' && validCivilDate(candidate) ? candidate : peruToday();
  });
  const selection = session && !checking && !error ? selected : null;
  const registrar = session?.user.rol === 'REGISTRADOR';
  const fecha = registrar ? attendanceDate : localDate;
  const paused = checking || Boolean(unverified);
  const attendance = useAsistenciaSession(session?.user.id ?? null, selection, fecha, paused, registrar);
  const calendar = useAttendanceCalendar(selection, fecha), day = calendar.data?.dias.find(item => item.fecha === fecha);
  const future = fecha > peruToday();
  const canWrite = day?.es_lectivo === true && !calendar.loading && !calendar.error && !future
    && (!registrar || selection?.year.estado === 'ABIERTO');
  const draft = useAttendanceDraft(session?.user.id ?? null, attendance.data, paused, revalidate, session?.user.rol === 'REGISTRADOR');
  const [search, setSearch] = useState({ key: draft.key, query: '' });
  const query = search.key === draft.key ? search.query : '';
  const valid = validCivilDate(fecha);
  const pending = draft.base ? draftSummary(draft.base.padron, draft.changes).pendientes : 0;
  const [saveRequest, setSaveRequest] = useState<{ base: typeof draft.base; changes: typeof draft.changes; reasons: typeof draft.reasons } | null>(null);
  const saveAllowed = registrar && canWrite && !draft.saveDisabled && draft.count > 0;
  const currentRequest = saveRequest && saveAllowed && pending > 0 && saveRequest.base === draft.base
    && saveRequest.changes === draft.changes && saveRequest.reasons === draft.reasons;
  if (saveRequest && !currentRequest) setSaveRequest(null);
  function save() {
    if (saveAllowed && pending > 0) setSaveRequest({ base: draft.base, changes: draft.changes, reasons: draft.reasons });
    else void draft.save();
  }
  return (
    <div className="space-y-4">
      {registrar ? <header className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight sm:text-3xl">{selection ? formatRegistrarSectionName(selection.section) : 'Asistencia diaria'}</h1>
        <Button variant="secondary" disabled={draft.busy} className="shrink-0" onClick={() => void request(() => navigate(`/secciones${location.search}`))}>
          <ArrowLeft aria-hidden="true" className="size-4" />Volver
        </Button>
      </header> : <>
        <Button variant="secondary" disabled={draft.busy} onClick={() => void navigate(`/secciones${location.search}`)}>
          <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />Volver a secciones</Button>
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">Asistencia diaria</h1>
      </>}
      {checking ? <LoadingState message="Comprobando la sección…" /> : error ? (
        <div className="space-y-3"><ErrorState message={error} />
          <Button variant="secondary" onClick={() => void revalidate()}>Volver a comprobar selección</Button></div>
      ) : !selection ? <EmptyState message="Selecciona una sección para consultar su asistencia diaria." /> : (
        <>
          {!registrar && <section aria-label="Detalle de sección" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="break-words text-lg font-semibold">{formatSectionName(selection.section)} — {educationLevelLabels[selection.section.nivel]}</h2>
              <p className="text-sm text-slate-600">Año escolar {selection.year.anio}</p>
              {selection.section.turno && <p className="break-words text-sm text-slate-600">Turno: {selection.section.turno}</p>}
          </section>}
          {!registrar && <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs sm:w-60"><FormField label="Fecha de asistencia" type="date" value={fecha} disabled={draft.busy}
              onChange={event => { const next = event.target.value; void request(() => setFecha(next)); }} error={valid ? undefined : 'Selecciona una fecha completa y válida.'} /></div>
            {!registrar && !draft.base && <Button disabled={!valid || future || attendance.pending || draft.busy} onClick={() => void request(attendance.open)} aria-describedby="opening-hint">
              {attendance.pending ? 'Abriendo asistencia…' : day?.es_lectivo === false ? 'Consultar sesión existente' : 'Abrir asistencia'}
            </Button>}
          </div>}
          {!registrar && !draft.base && day?.es_lectivo !== false && <p id="opening-hint" className="text-xs text-slate-600">{future
            ? 'No se puede registrar asistencia de una fecha futura.' : 'Abre o inicia la asistencia de esta fecha.'}</p>}
          {valid && <AttendanceCalendarInfo calendar={calendar} fecha={fecha} />}
          {registrar && future && day?.es_lectivo !== false && <p role="status" className="text-sm text-slate-600">No se puede registrar asistencia de una fecha futura.</p>}
          {attendance.pending && <LoadingState message="Abriendo o recuperando la sesión de asistencia…" />}
          {attendance.error && day?.es_lectivo !== false && <div className="space-y-3"><ErrorState message={attendance.error} />
            {registrar && <Button variant="secondary" onClick={attendance.retry}>Reintentar consulta</Button>}</div>}
          {draft.phase === 'denied' && <ErrorState message={draft.message} />}
          {draft.base && <>
            {canWrite && <AttendanceReview data={draft.base} changes={draft.changes} conflicts={draft.conflicts}
              reasons={draft.reasons} onResolve={draft.resolve} disabled={draft.busy} />}
            <AsistenciaSessionView data={draft.base} changes={draft.changes} created={attendance.data?.creada} editable={draft.editable && Boolean(canWrite)} disabled={draft.disabled || !canWrite} updated={draft.updated}
              compact={registrar}
              query={query} onSearch={query => setSearch({ key: draft.key, query })} pendingCount={draft.count}
              onSelect={draft.select} onMarkPending={registrar ? draft.applyMarkAllPending : draft.markAllPending}
              reasons={draft.reasons} justificationDisabled={draft.justificationDisabled}
              onJustify={canWrite && session?.user.rol === 'REGISTRADOR' ? draft.justify : undefined} />
          </>}
        </>
      )}
      {selection && draft.base && canWrite && <AttendanceSaveBar compact={registrar} count={draft.count} phase={draft.phase} message={draft.message}
        success={draft.success} conflicts={draft.conflicts.length}
        disabled={draft.saveDisabled || !canWrite} validation={draft.validation}
        onSave={save} onRefresh={() => void draft.refresh()} />}
      {currentRequest && <UnsavedChangesDialog open busy={false} dirty={false}
        confirmation={{ title: 'Guardar lista incompleta', message: `Quedan ${pending} estudiantes sin marcar. ¿Deseas guardar de todas formas?`,
          cancelLabel: 'Volver a revisar', confirmLabel: 'Guardar igualmente' }}
        onCancel={() => setSaveRequest(null)} onConfirm={() => {
          setSaveRequest(null);
          if (currentRequest) void draft.save();
        }} />}
    </div>
  );
}
