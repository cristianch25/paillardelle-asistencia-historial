import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import Button from '../../shared/components/Button';
import GuardianPhoneEditor from '../estudiantes/perfil/GuardianPhoneEditor';
import { useStudentProfileData } from '../estudiantes/perfil/useStudentProfileData';

export default function QuickGuardianContact({ studentId, yearId, month, busy, onBusyChange }: {
  studentId: string; yearId: string; month: string; busy: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const profile = useStudentProfileData(studentId, yearId, month, true), data = profile.data;
  return <section aria-label="Apoderado actual" className="min-w-0 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <h3 className="text-sm font-semibold text-slate-600">Apoderado actual</h3>
    {profile.loading && <LoadingState message="Consultando apoderado…" />}
    {profile.error && <><ErrorState message={profile.error} />
      <Button variant="secondary" disabled={busy} onClick={profile.retry}>Reintentar apoderado</Button></>}
    {data && (!data.apoderado_visible ? <p className="text-sm">Apoderado actual no disponible.</p>
      : !data.apoderado ? <p className="text-sm">Sin apoderado vinculado</p> : <>
        <p className="break-words font-medium">{data.apoderado.nombres_apellidos}</p>
        <fieldset disabled={busy} className="min-w-0">
          <GuardianPhoneEditor key={`${studentId}:${data.apoderado.telefono}`} studentId={studentId}
            phone={data.apoderado.telefono} onBusyChange={onBusyChange} onReload={profile.retry} />
        </fieldset>
      </>)}
  </section>;
}
