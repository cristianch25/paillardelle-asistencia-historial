import { useContext, useState } from 'react';
import { History } from 'lucide-react';
import { AuthContext } from '../../auth/AuthContext';
import Button from '../../../shared/components/Button';
import AttendanceHistoryDialog from './AttendanceHistoryDialog';

export default function AttendanceHistoryButton({
  asistenciaId,
  version,
}: {
  asistenciaId: string;
  version: number;
}) {
  const auth = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const role = auth?.session?.user?.rol;
  const canView = role === 'ADMIN' || role === 'SUBDIRECCION';

  if (!canView) return null;

  const hasHistory = version > 0;

  return (
    <>
      <Button
        variant="secondary"
        type="button"
        className="px-2.5 py-1 text-xs"
        disabled={!hasHistory}
        title={hasHistory ? 'Ver historial de modificaciones' : 'Sin historial disponible'}
        onClick={() => setOpen(true)}
      >
        <History aria-hidden="true" className="mr-1 inline size-3.5 shrink-0" />
        Historial
      </Button>
      {open && (
        <AttendanceHistoryDialog
          asistenciaId={asistenciaId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
