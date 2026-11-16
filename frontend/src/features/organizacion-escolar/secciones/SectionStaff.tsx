import Button from '../../../shared/components/Button';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import { useSectionStaff } from './useSectionStaff';

export default function SectionStaff({ sectionId, yearId, date }: { sectionId: string; yearId: string; date: string }) {
  const staff = useSectionStaff(sectionId, yearId, date);
  return <section aria-label="Personal asignado" className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-semibold">Personal asignado</h2>
    {staff.loading && <LoadingState message="Consultando personal asignado…" />}
    {staff.error && <><ErrorState message={staff.error} />
      <Button variant="secondary" onClick={staff.retry}>Reintentar personal asignado</Button></>}
    {staff.data && (staff.data.length ? <ul className="space-y-3">
      {staff.data.map(({ id, usuario }) => <li key={id} className="break-words">
        <p className="font-medium">{usuario.nombres} {usuario.apellidos}</p>
        {usuario.cargo && <p className="text-sm text-slate-600">{usuario.cargo}</p>}
      </li>)}
    </ul> : <p className="text-slate-600">Sin personal asignado para esta fecha</p>)}
  </section>;
}
